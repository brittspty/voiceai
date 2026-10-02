import type { CallOutcome, Prisma } from "@prisma/client";
import { getPorts } from "./adapters";
import { audit } from "./audit";
import { prisma } from "./db";
import { workerStepMs } from "./env";
import { evaluateGates } from "./gates";
import { crmSummary, placeIfAllowed } from "./pipeline";
import { getPublishedPolicy } from "./policy";
import { digitsOnly } from "./phone";
import { enqueue } from "./queue";
import { SYSTEM_ACTOR, type CallOutcomeName, type TimelineEvent, type TranscriptLine } from "./types";
import { zonedDayBounds } from "./time";

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appendTimeline(callId: string, event: TimelineEvent) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  const timeline = Array.isArray(call?.timeline) ? (call?.timeline as TimelineEvent[]) : [];
  timeline.push(event);
  await prisma.call.update({ where: { id: callId }, data: { timeline: timeline as unknown as Prisma.InputJsonValue } });
}

export async function gateContextForContact(contactId: string, now = new Date()) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { office: true } });
  if (!contact) throw new Error("Contact not found");
  const { policy } = await getPublishedPolicy();
  const timeZone = contact.timezone || contact.office?.timezone || "America/New_York";
  const { start, end } = zonedDayBounds(now, timeZone);
  const [dialsToday, attemptsForContact, dnc] = await Promise.all([
    prisma.call.count({ where: { dialedAt: { gte: start, lt: end } } }),
    prisma.call.count({ where: { contactId, dialedAt: { not: null } } }),
    prisma.doNotCall.findFirst({ where: { active: true, phone: { contains: digitsOnly(contact.phone).slice(-10) } } }),
  ]);
  const dncLive = Boolean(dnc && (!dnc.expiresAt || dnc.expiresAt > now));
  return {
    contact,
    policy,
    gate: {
      now,
      timeZone,
      consent: contact.consent,
      onDoNotCall: dncLive,
      dialsToday,
      attemptsForContact,
      policy,
    },
  };
}

export async function processDialJob(job: { id: string; payload: unknown; callId: string | null }) {
  const payload = (job.payload && typeof job.payload === "object" ? job.payload : {}) as {
    callId?: string;
    simulatedOutcome?: CallOutcomeName;
    placed?: boolean;
  };
  const callId = job.callId || payload.callId;
  if (!callId) throw new Error("Dial job is missing a call");
  const call = await prisma.call.findUnique({ where: { id: callId }, include: { contact: true, office: true } });
  if (!call) throw new Error("Call not found");
  if (call.status === "completed" || call.status === "failed") return;
  if (payload.placed) return;

  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const agent = await prisma.agentVersion.findFirst({ where: { status: "published" }, orderBy: { version: "desc" } });
  const draft = agent ?? (await prisma.agentVersion.findFirst({ orderBy: { version: "desc" } }));
  const agentName = org?.agentName || draft?.agentName || "Karen";
  const openingLine = draft?.openingLine || `Hi, this is ${agentName}.`;
  const ctx = await gateContextForContact(call.contactId);
  const ports = getPorts(Boolean(org?.testMode));
  const step = workerStepMs();

  const placed = await placeIfAllowed(
    {
      gate: ctx.gate,
      voice: ports.voice,
      voiceInput: {
        to: call.contact.phone,
        contactName: call.contact.name,
        agentName,
        openingLine,
        simulatedOutcome: payload.simulatedOutcome,
      },
    },
    {
      onStatus: async (status) => {
        await prisma.call.update({
          where: { id: call.id },
          data: {
            status,
            dialedAt: status === "dialing" ? new Date() : undefined,
            startedAt: status === "in_progress" ? new Date() : undefined,
          },
        });
        await appendTimeline(call.id, { at: new Date().toISOString(), label: status.replaceAll("_", " ") });
        await sleep(step);
      },
    },
  );

  await prisma.job.update({
    where: { id: job.id },
    data: { payload: { ...payload, callId, placed: true } as Prisma.InputJsonValue },
  });

  if (placed.kind === "blocked") {
    const reason = placed.checks.filter((c) => !c.passed).map((c) => c.detail).join(" ");
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "failed",
        outcome: "failed",
        gatesPassed: false,
        gateChecks: placed.checks as unknown as Prisma.InputJsonValue,
        failureReason: reason,
        endedAt: new Date(),
      },
    });
    await appendTimeline(call.id, { at: new Date().toISOString(), label: "Blocked before dial", detail: reason });
    await audit(SYSTEM_ACTOR, "Blocked a call before dialing", { type: "call", id: call.id, label: call.contact.name });
    return;
  }

  const voice = placed.voice;
  const waitingOnWebhook = !ports.mocked && voice.transcript.length === 0;
  await prisma.call.update({
    where: { id: call.id },
    data: {
      gatesPassed: true,
      gateChecks: placed.checks as unknown as Prisma.InputJsonValue,
      elevenLabsConversationId: voice.conversationId || null,
      twilioCallSid: voice.callSid || null,
      status: waitingOnWebhook ? "in_progress" : "wrap_up",
    },
  });

  if (waitingOnWebhook) {
    await appendTimeline(call.id, { at: new Date().toISOString(), label: "Waiting on the voice provider" });
    return;
  }

  await finishCall(call.id, {
    outcome: voice.outcome as CallOutcome,
    durationSec: voice.durationSec,
    costCents: voice.costCents,
    transcript: voice.transcript,
  });

}

export async function finishCall(
  callId: string,
  result: { outcome: CallOutcome; durationSec: number; costCents: number; transcript: TranscriptLine[] },
) {
  const call = await prisma.call.findUnique({ where: { id: callId }, include: { contact: true, office: true } });
  if (!call || call.status === "completed") return;
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const agentName = org?.agentName || "Karen";
  const booked = result.outcome === "booked";
  await prisma.call.update({
    where: { id: callId },
    data: {
      status: "completed",
      outcome: result.outcome,
      durationSec: result.durationSec,
      costCents: result.costCents,
      transcript: result.transcript as unknown as Prisma.InputJsonValue,
      connected: result.durationSec > 0 && result.outcome !== "failed" && result.outcome !== "no_answer",
      booked,
      endedAt: new Date(),
      recordingUrl: `/api/calls/${callId}/recording`,
    },
  });
  await appendTimeline(call.id, {
    at: new Date().toISOString(),
    label: "Call finished",
    detail: result.outcome.replaceAll("_", " "),
  });

  if (booked && call.officeId) {
    const starts = await nextOpenSlot(call.officeId);
    if (starts) {
      await prisma.appointment.create({
        data: {
          contactId: call.contactId,
          officeId: call.officeId,
          callId: call.id,
          advisorName: "Karen",
          startsAt: starts,
          endsAt: new Date(starts.getTime() + 30 * 60 * 1000),
          format: "phone",
          status: "confirmed",
        },
      });
      await appendTimeline(call.id, { at: new Date().toISOString(), label: "Meeting booked" });
    }
  }

  const summary = crmSummary(agentName, result.outcome, result.durationSec);
  const update = await prisma.crmUpdate.create({
    data: {
      callId: call.id,
      contactId: call.contactId,
      summary,
      status: "pending",
      payload: {
        phone: call.contact.phone,
        contactName: call.contact.name,
        ghlContactId: call.contact.ghlContactId,
        outcome: result.outcome,
        durationSec: result.durationSec,
        agentName,
        summary,
      },
    },
  });
  await enqueue({
    type: "crm_writeback",
    callId: call.id,
    contactId: call.contactId,
    payload: { crmUpdateId: update.id },
  });
  await audit(SYSTEM_ACTOR, "Finished a call and queued the CRM update", { type: "call", id: call.id, label: call.contact.name });
}

export async function processCrmJob(job: { payload: unknown; attempts: number }) {
  const payload = (job.payload && typeof job.payload === "object" ? job.payload : {}) as { crmUpdateId?: string; forceFail?: boolean };
  if (!payload.crmUpdateId) throw new Error("CRM job is missing an update");
  const update = await prisma.crmUpdate.findUnique({ where: { id: payload.crmUpdateId } });
  if (!update) throw new Error("CRM update not found");
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const ports = getPorts(Boolean(org?.testMode));
  const body = update.payload as {
    phone: string;
    contactName: string;
    ghlContactId?: string | null;
    outcome: CallOutcomeName;
    durationSec: number;
    agentName: string;
    summary: string;
  };
  try {
    const written = await ports.crm.writeOutcome({ ...body, forceFail: payload.forceFail });
    await prisma.crmUpdate.update({
      where: { id: update.id },
      data: { status: "succeeded", attempts: job.attempts, lastError: null, payload: { ...body, externalId: written.externalId } },
    });
    await audit(SYSTEM_ACTOR, "Wrote a call outcome back to GoHighLevel", {
      type: "crm_update",
      id: update.id,
      label: body.contactName,
    });
  } catch (error) {
    await prisma.crmUpdate.update({
      where: { id: update.id },
      data: {
        status: job.attempts >= 3 ? "failed" : "pending",
        attempts: job.attempts,
        lastError: error instanceof Error ? error.message : "CRM write failed",
      },
    });
    throw error;
  }
}

export async function processInboundJob(job: { payload: unknown }) {
  const payload = (job.payload && typeof job.payload === "object" ? job.payload : {}) as { body?: unknown; source?: string };
  if (payload.source === "elevenlabs" && payload.body) {
    const { parseEleven } = await import("./webhook-parse");
    const { applyElevenEvent } = await import("./webhook-apply");
    const event = parseEleven(payload.body);
    if (event) await applyElevenEvent(event);
    return;
  }
  if (payload.body) {
    const { parseGhl } = await import("./webhook-parse");
    const { applyGhlEvent } = await import("./webhook-apply");
    await applyGhlEvent(parseGhl(payload.body));
  }
  await audit(SYSTEM_ACTOR, "Reprocessed an incoming event", { type: "job", label: payload.source || "event" });
}

async function nextOpenSlot(officeId: string) {
  const office = await prisma.office.findUnique({ where: { id: officeId }, include: { hours: true } });
  if (!office) return null;
  const now = new Date();
  for (let day = 0; day < 14; day += 1) {
    const probe = new Date(now.getTime() + day * 86400000);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: office.timezone, weekday: "short" }).format(probe);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts);
    const hours = office.hours.find((h) => h.weekday === weekday);
    if (!hours || hours.closed) continue;
    const [oh, om] = hours.openTime.split(":").map(Number);
    const [ch, cm] = hours.closeTime.split(":").map(Number);
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: office.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(probe);
    for (let mins = oh * 60 + om; mins + 30 <= ch * 60 + cm; mins += 30) {
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      const { zonedTimeToUtc } = await import("./time");
      const start = zonedTimeToUtc(`${iso}T${hh}:${mm}:00`, office.timezone);
      if (start.getTime() < now.getTime() + 30 * 60 * 1000) continue;
      const taken = await prisma.appointment.findFirst({
        where: { officeId, status: { not: "cancelled" }, startsAt: start },
      });
      if (!taken) return start;
    }
  }
  return null;
}

export async function runJob(job: { id: string; type: string; payload: unknown; attempts: number; callId: string | null }) {
  if (job.type === "dial") await processDialJob(job);
  else if (job.type === "crm_writeback") await processCrmJob(job);
  else if (job.type === "inbound_event") await processInboundJob(job);
  else throw new Error(`Unknown job type ${job.type}`);
}

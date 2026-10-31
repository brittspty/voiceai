import type { CallOutcome, Prisma } from "@prisma/client";
import { getPorts } from "./adapters";
import { ais2lComplianceV2Enabled, callReason } from "./ais2l/flag";
import { testDialDecision } from "./ais2l/screen";
import { planHumanHandoff, detectHumanHandoff } from "./ais2l/handoff";
import { callingDecision } from "./ais2l/hours";
import { buildOpener, firstCallControl } from "./ais2l/opener";
import { contactUtterances, detectOptOut } from "./ais2l/opt-out";
import { outcomeNote } from "./ais2l/outcomes";
import { buildCompliancePrompt } from "./ais2l/prompt";
import { applyVoicemailPolicy, notedSilenceSeconds, silenceHangupSeconds } from "./ais2l/voicemail";
import { audit } from "./audit";
import { clientConfig } from "./client-config";
import { prisma } from "./db";
import { workerStepMs } from "./env";
import { sendHandoffEmail } from "./mail";
import { crmSummary, placeIfAllowed } from "./pipeline";
import { getPublishedPolicy } from "./policy";
import { digitsOnly, normalizePhone } from "./phone";
import { scoreCallIfEnabled } from "./marketing/lead-score/store";
import { enqueue } from "./queue";
import { SYSTEM_ACTOR, type CallOutcomeName, type TimelineEvent, type TranscriptLine } from "./types";
import { noteVoiceTouch } from "./marketing/speed-to-lead-store";
import { errorText } from "./marketing/speed-to-lead";
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
  const published = (await getPublishedPolicy()).policy;
  const enabled = ais2lComplianceV2Enabled();
  const decision = enabled
    ? callingDecision({
        now,
        phone: contact.phone,
        addressTimezone: contact.timezone,
        officeTimezones: [contact.office?.timezone, clientConfig().timezone],
        policy: published,
      })
    : null;
  const queueInstead = decision?.action === "queue";
  const timeZone = decision?.action === "dial" ? decision.timeZone : contact.timezone || contact.office?.timezone || clientConfig().timezone;
  const policy = decision?.action === "dial" ? decision.policy : published;
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
    queueInstead,
    queueRunAt: decision?.action === "queue" ? decision.runAt : null,
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
  const agentName = org?.agentName || draft?.agentName || clientConfig().agentName;
  const companyName = org?.name || clientConfig().companyName;
  const ctx = await gateContextForContact(call.contactId);
  if (ctx.queueInstead && ctx.queueRunAt) {
    await appendTimeline(call.id, {
      at: new Date().toISOString(),
      label: "Queued",
      detail: "Timezone is unknown. The call was not dialed.",
    });
    await enqueue({
      type: "dial",
      callId: call.id,
      contactId: call.contactId,
      runAt: ctx.queueRunAt,
      payload: { callId, simulatedOutcome: payload.simulatedOutcome, deferred: "unknown_timezone" },
    });
    await audit(SYSTEM_ACTOR, "Queued a call because the lead timezone is unknown", { type: "call", id: call.id, label: call.contact.name });
    return;
  }
  const decision = testDialDecision({ orgTestMode: Boolean(org?.testMode), phone: call.contact.phone });
  if (!decision.allowed) {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "failed",
        outcome: "failed",
        gatesPassed: false,
        failureReason: decision.reason,
        endedAt: new Date(),
        gateChecks: [{ id: "test_number", label: "Test number", passed: false, detail: decision.reason }] as unknown as Prisma.InputJsonValue,
      },
    });
    await appendTimeline(call.id, { at: new Date().toISOString(), label: "Blocked before dial", detail: decision.reason });
    await audit(SYSTEM_ACTOR, "Blocked a call because voice is in test mode", { type: "call", id: call.id, label: call.contact.name });
    return;
  }

  const ports = getPorts(Boolean(org?.testMode));
  const step = workerStepMs();
  const complianceOn = ais2lComplianceV2Enabled();
  const reason = callReason();
  let openingLine = draft?.openingLine || `Hi, this is ${agentName}.`;
  let compliancePrompt: string | undefined;
  if (complianceOn) {
    openingLine = buildOpener({ agentName, companyName, reason });
    const priorVoicemails = await prisma.call.count({ where: { contactId: call.contactId, outcome: "voicemail" } });
    compliancePrompt = buildCompliancePrompt({
      agentName,
      companyName,
      reason,
      silenceSec: silenceHangupSeconds(),
      voicemailAllowed: priorVoicemails === 0,
    });
  }

  const placed = await placeIfAllowed(
    {
      gate: ctx.gate,
      voice: ports.voice,
      voiceInput: {
        to: call.contact.phone,
        contactName: call.contact.name,
        agentName,
        companyName,
        openingLine,
        simulatedOutcome: payload.simulatedOutcome,
        compliancePrompt,
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
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { contact: true, office: { include: { advisors: true } } },
  });
  if (!call || call.status === "completed") return;
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const agentName = org?.agentName || clientConfig().agentName;
  const companyName = org?.name || clientConfig().companyName;
  const complianceOn = ais2lComplianceV2Enabled();
  const contactLines = result.transcript.filter((line) => line.speaker === "contact").map((line) => line.text);
  let outcome: CallOutcome = result.outcome;
  let durationSec = result.durationSec;
  let optOutPhrase: string | null = null;
  let handoffPlan: ReturnType<typeof planHumanHandoff> | null = null;
  let machineNote: string | null = null;
  if (complianceOn) {
    const priorVoicemails = await prisma.call.count({
      where: { contactId: call.contactId, outcome: "voicemail", NOT: { id: call.id } },
    });
    const applied = applyVoicemailPolicy({
      outcome,
      durationSec,
      priorVoicemails,
      silenceSec: notedSilenceSeconds(result.transcript),
      silenceLimitSec: silenceHangupSeconds(),
      contactLines,
    });
    outcome = applied.outcome;
    durationSec = applied.durationSec;
    if (applied.action === "hangup" && applied.reason) {
      const notes = {
        already_left: "A voicemail was already left for this contact. Hung up without leaving another.",
        silence: "Hung up after silence.",
        ivr: "Hung up. IVR menus are not navigated.",
        menu: "Hung up. Voicemail menus are not navigated.",
      } as const;
      machineNote = notes[applied.reason];
    }
    const optOut = detectOptOut(contactUtterances(result.transcript));
    if (optOut.matched) optOutPhrase = optOut.phrase;
    const handoff = detectHumanHandoff(contactUtterances(result.transcript));
    if (handoff.matched) {
      const managers = await prisma.user.findMany({
        where: { role: "account_manager" },
        select: { id: true, name: true, email: true },
      });
      const advisorEmails = new Set(
        (call.office?.advisors ?? []).map((advisor) => advisor.email?.toLowerCase()).filter((email): email is string => Boolean(email)),
      );
      const assigned = managers.find((manager) => advisorEmails.has(manager.email.toLowerCase()));
      handoffPlan = planHumanHandoff({
        contactName: call.contact.name,
        phone: call.contact.phone,
        hit: handoff,
        managers,
        assignedManagerId: assigned?.id,
      });
    }
  }
  const booked = outcome === "booked" && !handoffPlan;
  const endedAt = new Date();
  await prisma.call.update({
    where: { id: callId },
    data: {
      status: "completed",
      outcome,
      durationSec,
      costCents: result.costCents,
      transcript: result.transcript as unknown as Prisma.InputJsonValue,
      connected: durationSec > 0 && outcome !== "failed" && outcome !== "no_answer",
      booked,
      endedAt,
      recordingUrl: `/api/calls/${callId}/recording`,
    },
  });
  await appendTimeline(call.id, {
    at: new Date().toISOString(),
    label: "Call finished",
    detail: outcome.replaceAll("_", " "),
  });
  if (machineNote) await appendTimeline(call.id, { at: new Date().toISOString(), label: "Voicemail rule", detail: machineNote });
  if (complianceOn) {
    const control = firstCallControl(contactLines, { agentName, companyName, reason: callReason() });
    if (control.kind !== "none") {
      const labels = { screening: "Call screening", transfer: "Transfer", hold: "Hold" } as const;
      await appendTimeline(call.id, { at: new Date().toISOString(), label: labels[control.kind], detail: control.say });
    }
  }

  if (booked && call.officeId) {
    const starts = await nextOpenSlot(call.officeId);
    if (starts) {
      await prisma.appointment.create({
        data: {
          contactId: call.contactId,
          officeId: call.officeId,
          callId: call.id,
          advisorName: agentName,
          startsAt: starts,
          endsAt: new Date(starts.getTime() + 30 * 60 * 1000),
          format: "phone",
          status: "confirmed",
        },
      });
      await appendTimeline(call.id, { at: new Date().toISOString(), label: "Meeting booked" });
    }
  }

  if (optOutPhrase) {
    await ensureOptOut(call.contact.phone, optOutPhrase);
    await appendTimeline(call.id, { at: new Date().toISOString(), label: "Do-not-call", detail: `Opt-out: ${optOutPhrase}` });
    await audit(SYSTEM_ACTOR, "Marked a contact do-not-call after an opt-out", { type: "contact", id: call.contactId, label: call.contact.name });
  }
  if (handoffPlan) {
    await appendTimeline(call.id, {
      at: new Date().toISOString(),
      label: "Human takeover",
      detail: handoffPlan.notices.map((notice) => notice.body).join(" "),
    });
    for (const notice of handoffPlan.notices) {
      await audit(SYSTEM_ACTOR, `Flagged a call for human takeover and notified ${notice.toName}`, {
        type: "call",
        id: call.id,
        label: call.contact.name,
      });
      await sendHandoffEmail(notice).catch((error) => {
        console.error("[ais2l] handoff notice was not emailed", errorText(error));
      });
    }
  }

  const summary = complianceOn
    ? outcomeNote({
        agentName,
        outcome,
        durationSec,
        dialedAt: call.dialedAt,
        startedAt: call.startedAt,
        endedAt,
        doNotCall: Boolean(optOutPhrase),
      })
    : crmSummary(agentName, outcome, durationSec);
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
        outcome,
        durationSec,
        agentName,
        summary,
        ...(complianceOn
          ? {
              dialedAt: call.dialedAt?.toISOString() ?? null,
              startedAt: call.startedAt?.toISOString() ?? null,
              endedAt: endedAt.toISOString(),
              replaceOutcomeTags: true,
              alsoAddTags: optOutPhrase ? ["do-not-call"] : [],
            }
          : {}),
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
  const connected = durationSec > 0 && outcome !== "failed" && outcome !== "no_answer";
  if (connected) {
    await noteVoiceTouch({ contactId: call.contactId, at: call.startedAt ?? new Date(), callId: call.id }).catch((error) => {
      console.error("[speed-to-lead] voice touch was not recorded", errorText(error));
    });
  }
  await scoreCallIfEnabled(call.id);
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
    dialedAt?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    replaceOutcomeTags?: boolean;
    alsoAddTags?: string[];
    existingTags?: string[];
  };
  try {
    const written = await ports.crm.writeOutcome({ ...body, forceFail: payload.forceFail });
    await prisma.crmUpdate.update({
      where: { id: update.id },
      data: {
        status: "succeeded",
        attempts: job.attempts,
        lastError: null,
        payload: {
          ...body,
          externalId: written.externalId,
          ...(written.removedTags ? { removedTags: written.removedTags } : {}),
          ...(written.addedTags ? { addedTags: written.addedTags } : {}),
        },
      },
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

async function ensureOptOut(phone: string, phrase: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return;
  const last10 = digitsOnly(normalized).slice(-10);
  const existing = await prisma.doNotCall.findFirst({ where: { active: true, phone: { contains: last10 } } });
  if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) return;
  await prisma.doNotCall.create({
    data: {
      phone: normalized,
      reason: `Said "${phrase}"`,
      source: "ais2l",
      addedByName: "System",
      active: true,
    },
  });
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

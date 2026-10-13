import type { CallOutcome, Prisma } from "@prisma/client";
import { audit } from "./audit";
import { clientConfig } from "./client-config";
import { prisma } from "./db";
import { finishCall } from "./dialer";
import { enqueue } from "./queue";
import { SYSTEM_ACTOR } from "./types";
import { buildTranscript } from "./transcript";
import type { ElevenEvent, GhlEvent, TwilioEvent } from "./webhook-parse";
import { mapVendorOutcome, parseGhl } from "./webhook-parse";
import { normalizePhone } from "./phone";
import { reduceTwilioCallStatus, type CallSnapshot } from "./twilio";

export async function applyGhlEvent(event: GhlEvent) {
  if (event.kind === "ignore") return { ok: true, ignored: true };
  if (event.kind === "appointment") {
    const contact = event.contactGhlId
      ? await prisma.contact.findFirst({ where: { ghlContactId: event.contactGhlId } })
      : event.phone
        ? await prisma.contact.findFirst({ where: { phone: event.phone } })
        : null;
    const office = await prisma.office.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
    const org = await prisma.org.findUnique({ where: { id: "org" } });
    if (contact && office) {
      await prisma.appointment.upsert({
        where: { id: event.ghlId ? `appt_${event.ghlId}` : `appt_${contact.id}_${event.startTime}` },
        update: { status: event.status === "cancelled" ? "cancelled" : "confirmed" },
        create: {
          id: event.ghlId ? `appt_${event.ghlId}` : undefined,
          contactId: contact.id,
          officeId: office.id,
          advisorName: org?.agentName || clientConfig().agentName,
          startsAt: new Date(event.startTime),
          endsAt: new Date(new Date(event.startTime).getTime() + 30 * 60 * 1000),
          format: "phone",
          status: event.status === "cancelled" ? "cancelled" : "confirmed",
          ghlEventId: event.ghlId,
        },
      });
    }
    await audit(SYSTEM_ACTOR, "Received an appointment event from GoHighLevel", { type: "appointment", label: event.event });
    return { ok: true };
  }

  if (!event.phone) {
    if (!event.ghlId) return { ok: true, ignored: true };
    const existing = await prisma.contact.findFirst({ where: { ghlContactId: event.ghlId } });
    if (!existing) return { ok: true, ignored: true };
    await updateContactConsent(existing.id, event);
    return { ok: true };
  }
  const phone = normalizePhone(event.phone);
  const existing = event.ghlId
    ? await prisma.contact.findFirst({ where: { ghlContactId: event.ghlId } })
    : await prisma.contact.findFirst({ where: { phone } });
  const office = await prisma.office.findFirst({ where: { type: "virtual", status: "active" } });
  let contact =
    existing ??
    (await prisma.contact.create({
      data: {
        name: event.name,
        phone,
        email: event.email,
        officeId: office?.id,
        consent: event.consentTier ?? "none",
        consentRevoked: event.consentRevoked ?? false,
        consentAt: event.consentTier && event.consentTier !== "none" ? new Date() : null,
        tags: event.tags,
        source: "GoHighLevel",
        ghlContactId: event.ghlId,
        timezone: event.timezone || office?.timezone || clientConfig().timezone,
      },
    }));
  if (existing) contact = await updateContactConsent(existing.id, event);
  await audit(SYSTEM_ACTOR, "Synced a lead from GoHighLevel", { type: "contact", id: contact.id, label: contact.name });
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  if (org?.scheduleEnabled) {
    const call = await prisma.call.create({
      data: {
        contactId: contact.id,
        officeId: contact.officeId,
        status: "queued",
        consent: contact.consent,
        isTest: false,
        direction: "outbound",
        timeline: [{ at: new Date().toISOString(), label: "Lead triggered a dial" }] as Prisma.InputJsonValue,
      },
    });
    await enqueue({ type: "dial", callId: call.id, contactId: contact.id, payload: { callId: call.id } });
  }
  return { ok: true, contactId: contact.id };
}

export async function applyElevenEvent(event: ElevenEvent) {
  const call = await prisma.call.findFirst({
    where: {
      OR: [
        { elevenLabsConversationId: event.conversationId },
        event.callSid ? { twilioCallSid: event.callSid } : { id: "__none__" },
      ],
    },
    include: { contact: true },
  });
  if (!call) throw new Error(`No call for conversation ${event.conversationId}`);
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const outcome = (mapVendorOutcome(event.outcome) ?? "callback_requested") as CallOutcome;
  const transcript =
    event.transcript && event.transcript.length
      ? event.transcript
      : buildTranscript(org?.agentName || clientConfig().agentName, call.contact.name, outcome, org?.name);
  await finishCall(call.id, {
    outcome,
    durationSec: event.durationSec ?? call.durationSec ?? 0,
    costCents: event.costCents ?? call.costCents ?? 0,
    transcript,
  });
  return { ok: true, callId: call.id };
}

export async function applyTwilioEvent(event: TwilioEvent) {
  const call = await prisma.call.findFirst({ where: { twilioCallSid: event.callSid } });
  if (!call) return { ok: true, ignored: true };
  const nowIso = new Date().toISOString();
  const current: CallSnapshot = {
    status: call.status,
    outcome: call.outcome,
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    dialedAt: call.dialedAt?.toISOString() ?? null,
    durationSec: call.durationSec,
    failureReason: call.failureReason,
  };
  const reduced = reduceTwilioCallStatus(current, event, nowIso);
  if (!reduced.changed) return { ok: true, unchanged: true };
  const timeline = Array.isArray(call.timeline) ? [...(call.timeline as unknown[])] : [];
  timeline.push({ at: nowIso, label: `Twilio ${event.status.toLowerCase()}` });
  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: reduced.next.status,
      outcome: (reduced.next.outcome as CallOutcome | null) ?? undefined,
      startedAt: reduced.next.startedAt ? new Date(reduced.next.startedAt) : undefined,
      endedAt: reduced.next.endedAt ? new Date(reduced.next.endedAt) : undefined,
      dialedAt: reduced.next.dialedAt ? new Date(reduced.next.dialedAt) : undefined,
      durationSec: reduced.next.durationSec,
      failureReason: reduced.next.failureReason,
      timeline: timeline as Prisma.InputJsonValue,
    },
  });
  return { ok: true };
}

export async function logInboundTwilioCall(params: Record<string, string>) {
  const callSid = params.CallSid || params.callSid;
  if (!callSid) return { ok: true, ignored: true };
  const existing = await prisma.call.findFirst({ where: { twilioCallSid: callSid } });
  if (existing) return { ok: true, callId: existing.id, duplicate: true };
  const phone = normalizePhone(params.From || params.Caller || "");
  const office = await prisma.office.findFirst({ where: { type: "virtual", status: "active" } });
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  let contact = phone ? await prisma.contact.findFirst({ where: { phone } }) : null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        name: "Inbound caller",
        phone: phone || `inbound:${callSid}`,
        officeId: office?.id,
        consent: "none",
        source: "Inbound",
        timezone: office?.timezone || org?.timezone || clientConfig().timezone,
      },
    });
  }
  const call = await prisma.call.create({
    data: {
      contactId: contact.id,
      officeId: contact.officeId,
      status: "queued",
      consent: contact.consent,
      isTest: Boolean(org?.testMode),
      direction: "inbound",
      twilioCallSid: callSid,
      timeline: [{ at: new Date().toISOString(), label: "Inbound call" }] as Prisma.InputJsonValue,
    },
  });
  await audit(SYSTEM_ACTOR, "Logged an inbound call", { type: "call", id: call.id, label: contact.phone });
  return { ok: true, callId: call.id };
}

async function updateContactConsent(contactId: string, event: Extract<GhlEvent, { kind: "contact" }>) {
  const data: Prisma.ContactUpdateInput = {};
  if (event.consentTier) {
    data.consent = event.consentTier;
    data.consentAt = event.consentTier === "none" ? null : new Date();
  }
  if (event.consentRevoked !== undefined) data.consentRevoked = event.consentRevoked;
  if (event.tagsProvided) data.tags = { set: event.tags };
  if (!Object.keys(data).length) {
    const current = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!current) throw new Error("Contact not found");
    return current;
  }
  return prisma.contact.update({ where: { id: contactId }, data });
}

export async function acceptOrQueue(source: "ghl" | "elevenlabs" | "twilio", body: unknown) {
  try {
    if (source === "ghl") return await applyGhlEvent(parseGhl(body));
    if (source === "elevenlabs") {
      const { parseEleven } = await import("./webhook-parse");
      const event = parseEleven(body);
      if (!event) return { ok: true, ignored: true };
      return await applyElevenEvent(event);
    }
    const { parseTwilio } = await import("./webhook-parse");
    const event = parseTwilio(body);
    if (!event) return { ok: true, ignored: true };
    return await applyTwilioEvent(event);
  } catch (error) {
    await enqueue({
      type: "inbound_event",
      payload: { source, body: body as Prisma.InputJsonValue },
    });
    await audit(SYSTEM_ACTOR, "Queued an incoming event after it failed", {
      type: "webhook",
      label: error instanceof Error ? error.message : source,
    });
    return { ok: false, queued: true };
  }
}

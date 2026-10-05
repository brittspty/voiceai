import type { CallOutcome, Prisma } from "@prisma/client";
import { ghlFetch, voiceIsMocked } from "./adapters";
import { audit } from "./audit";
import { clientConfig, consentFieldConfig } from "./client-config";
import { reviewContactConsent } from "./consent";
import { saveConsentReview, sharedFieldCache } from "./consent-review";
import { prisma } from "./db";
import { finishCall } from "./dialer";
import { enqueue } from "./queue";
import { SYSTEM_ACTOR } from "./types";
import { buildTranscript } from "./transcript";
import type { ElevenEvent, GhlEvent, TwilioEvent } from "./webhook-parse";
import { mapVendorOutcome, parseGhl } from "./webhook-parse";
import { normalizePhone } from "./phone";

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

  if (!event.phone) return { ok: true, ignored: true };
  const phone = normalizePhone(event.phone);
  const existing = event.ghlId
    ? await prisma.contact.findFirst({ where: { ghlContactId: event.ghlId } })
    : await prisma.contact.findFirst({ where: { phone } });
  const office = await prisma.office.findFirst({ where: { type: "virtual", status: "active" } });
  const contact =
    existing ??
    (await prisma.contact.create({
      data: {
        name: event.name,
        phone,
        email: event.email,
        officeId: office?.id,
        consent: "none",
        source: "GoHighLevel",
        ghlContactId: event.ghlId,
        timezone: event.timezone || office?.timezone || clientConfig().timezone,
      },
    }));
  await audit(SYSTEM_ACTOR, "Synced a lead from GoHighLevel", { type: "contact", id: contact.id, label: contact.name });
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const consentConfig = consentFieldConfig();
  const decision = await reviewContactConsent(
    {
      ghlContactId: contact.ghlContactId,
      phone: contact.phone,
      storedConsent: contact.consent,
      mocked: voiceIsMocked(Boolean(org?.testMode)),
    },
    { fetchImpl: ghlFetch, cache: sharedFieldCache(consentConfig.cacheTtlMs) },
  );
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
    await saveConsentReview({ contactId: contact.id, callId: call.id, contactName: contact.name, decision });
    await enqueue({ type: "dial", callId: call.id, contactId: contact.id, payload: { callId: call.id } });
  } else {
    await saveConsentReview({ contactId: contact.id, callId: null, contactName: contact.name, decision });
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
  const status = event.status.toLowerCase();
  if (status === "queued" || status === "ringing") {
    await prisma.call.update({ where: { id: call.id }, data: { status: "dialing" } });
  } else if (status === "in-progress") {
    await prisma.call.update({ where: { id: call.id }, data: { status: "in_progress", startedAt: call.startedAt ?? new Date() } });
  } else if (status === "busy" || status === "no-answer" || status === "failed" || status === "canceled") {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "failed",
        outcome: status === "no-answer" ? "no_answer" : "failed",
        durationSec: 0,
        endedAt: new Date(),
        failureReason: `Twilio reported ${status}`,
      },
    });
  } else if (status === "completed" && event.durationSec != null) {
    await prisma.call.update({ where: { id: call.id }, data: { durationSec: event.durationSec } });
  }
  return { ok: true };
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

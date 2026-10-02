import { createHmac, timingSafeEqual } from "crypto";
import { normalizePhone } from "./phone";

export function signBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret: string | undefined, body: string, header: string | null, mode: "mock" | "live") {
  if (!secret) return mode !== "live";
  if (!header) return false;
  const expected = signBody(secret, body);
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type GhlEvent =
  | {
      kind: "contact";
      event: string;
      ghlId?: string;
      name: string;
      phone: string;
      email?: string;
      tags: string[];
      timezone?: string;
    }
  | {
      kind: "appointment";
      event: string;
      ghlId?: string;
      contactGhlId?: string;
      phone?: string;
      startTime: string;
      status?: string;
      calendarId?: string;
    }
  | { kind: "ignore"; event: string };

export function parseGhl(body: unknown): GhlEvent {
  const root = asRecord(body);
  const event = String(root.type || root.event || root.typeName || "event");
  const contact = asRecord(root.contact ?? root);
  const appointment = asRecord(root.appointment ?? root.calendar ?? {});
  const phone = normalizePhone(String(contact.phone || contact.phoneNumber || root.phone || ""));
  const start = String(appointment.startTime || appointment.start_time || root.startTime || "");
  if (/appointment/i.test(event) || start) {
    return {
      kind: "appointment",
      event,
      ghlId: str(appointment.id || root.appointmentId),
      contactGhlId: str(contact.id || root.contactId),
      phone: phone || undefined,
      startTime: start || new Date().toISOString(),
      status: str(appointment.status || root.status),
      calendarId: str(appointment.calendarId || root.calendarId),
    };
  }
  if (!phone && !contact.id) return { kind: "ignore", event };
  const first = str(contact.firstName);
  const last = str(contact.lastName);
  const name = str(contact.name || contact.fullName || contact.contactName) || [first, last].filter(Boolean).join(" ") || "New lead";
  const tags = Array.isArray(contact.tags) ? contact.tags.map((t) => String(t)) : [];
  return {
    kind: "contact",
    event,
    ghlId: str(contact.id || root.contactId),
    name,
    phone,
    email: str(contact.email),
    tags,
    timezone: str(contact.timezone || contact.timeZone),
  };
}

export type ElevenEvent = {
  conversationId: string;
  callSid?: string;
  outcome?: string;
  durationSec?: number;
  costCents?: number;
  transcript?: { speaker: "agent" | "contact"; text: string; atSec: number }[];
};

export function parseEleven(body: unknown): ElevenEvent | null {
  const root = asRecord(body);
  const data = asRecord(root.data ?? root);
  const conversationId = str(data.conversation_id || data.conversationId || root.conversation_id);
  if (!conversationId) return null;
  const analysis = asRecord(data.analysis ?? {});
  const metadata = asRecord(data.metadata ?? {});
  const rawTranscript = data.transcript ?? data.messages;
  let transcript: ElevenEvent["transcript"];
  if (Array.isArray(rawTranscript)) {
    transcript = rawTranscript.map((line, index) => {
      const row = asRecord(line);
      const role = String(row.role || row.speaker || "agent");
      return {
        speaker: /user|contact|customer|human/i.test(role) ? "contact" : "agent",
        text: String(row.message || row.text || ""),
        atSec: Number(row.time_in_call_secs ?? row.atSec ?? index * 4),
      };
    });
  }
  const duration = num(metadata.call_duration_secs ?? data.duration ?? data.call_duration_secs);
  const cost = num(metadata.cost ?? data.cost);
  return {
    conversationId,
    callSid: str(data.call_sid || data.callSid || metadata.call_sid),
    outcome: str(analysis.outcome || data.outcome || analysis.call_successful),
    durationSec: duration,
    costCents: cost == null ? undefined : cost < 10 ? Math.round(cost * 100) : Math.round(cost),
    transcript,
  };
}

export type TwilioEvent = {
  callSid: string;
  status: string;
  durationSec?: number;
};

export function parseTwilio(body: unknown): TwilioEvent | null {
  const root = asRecord(body);
  const callSid = str(root.CallSid || root.callSid);
  if (!callSid) return null;
  return {
    callSid,
    status: String(root.CallStatus || root.callStatus || ""),
    durationSec: num(root.CallDuration || root.callDuration),
  };
}

export function mapVendorOutcome(value: string | undefined): "callback_requested" | "booked" | "not_interested" | "no_answer" | "voicemail" | "failed" | "wrong_number" | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v.includes("book")) return "booked";
  if (v.includes("callback") || v === "true" || v === "success") return "callback_requested";
  if (v.includes("voicemail")) return "voicemail";
  if (v.includes("no_answer") || v.includes("no-answer") || v.includes("no answer")) return "no_answer";
  if (v.includes("wrong")) return "wrong_number";
  if (v.includes("not_interested") || v.includes("not interested")) return "not_interested";
  if (v.includes("fail") || v === "false") return "failed";
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

import { createHmac, timingSafeEqual } from "crypto";
import { verifySignature } from "./webhook-parse";

export const ELEVENLABS_REGISTER_CALL_URL = "https://api.elevenlabs.io/v1/convai/twilio/register-call";

const TERMINAL_FAILURE = new Set(["busy", "no-answer", "failed", "canceled", "cancelled"]);

export type TwilioCaller = "twilio" | "internal";

export type CallSnapshot = {
  status: "queued" | "dialing" | "in_progress" | "wrap_up" | "completed" | "failed";
  outcome: string | null;
  startedAt: string | null;
  endedAt: string | null;
  dialedAt: string | null;
  durationSec: number;
  failureReason: string | null;
};

const STATUS_RANK: Record<CallSnapshot["status"], number> = {
  queued: 0,
  dialing: 1,
  in_progress: 2,
  wrap_up: 3,
  completed: 4,
  failed: 4,
};

export function twilioSignaturePayload(url: string, params: Iterable<[string, string]>) {
  const grouped = new Map<string, Set<string>>();
  for (const [key, value] of params) {
    const values = grouped.get(key) ?? new Set<string>();
    values.add(value);
    grouped.set(key, values);
  }
  let data = url;
  for (const key of [...grouped.keys()].sort()) {
    for (const value of [...(grouped.get(key) ?? [])].sort()) data += key + value;
  }
  return data;
}

export function signTwilioRequest(authToken: string, url: string, params: Iterable<[string, string]>) {
  return createHmac("sha1", authToken).update(twilioSignaturePayload(url, params), "utf8").digest("base64");
}

export function twilioSignaturesMatch(expected: string, provided: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Public URLs Twilio may have signed. APP_URL wins behind a reverse proxy; forwarded host is also tried. */
export function twilioValidationUrls(input: {
  requestUrl: string;
  appUrl?: string;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
}) {
  const path = pathAndQuery(input.requestUrl);
  const candidates: string[] = [];
  const app = (input.appUrl || "").trim().replace(/\/$/, "");
  if (app) candidates.push(`${app}${path}`);
  const proto = firstHeaderValue(input.forwardedProto);
  const host = firstHeaderValue(input.forwardedHost);
  if (proto && host) candidates.push(`${proto}://${host}${path}`);
  candidates.push(input.requestUrl);
  return [...new Set(candidates.flatMap(portVariants))];
}

export function verifyTwilioSignature(input: {
  authToken: string | undefined;
  signature: string | null;
  urls: string[];
  params: Iterable<[string, string]>;
}) {
  if (!input.authToken || !input.signature) return false;
  const params = [...input.params];
  return input.urls.some((url) => twilioSignaturesMatch(signTwilioRequest(input.authToken as string, url, params), input.signature as string));
}

export function authorizeTwilioWebhook(input: {
  mode: "mock" | "live";
  authToken?: string;
  webhookSecret?: string;
  rawBody: string;
  params: Iterable<[string, string]>;
  urls: string[];
  twilioSignature: string | null;
  voiceopsSignature: string | null;
  webhookSecretHeader: string | null;
}) {
  if (input.twilioSignature) {
    const ok = verifyTwilioSignature({
      authToken: input.authToken,
      signature: input.twilioSignature,
      urls: input.urls,
      params: input.params,
    });
    return ok ? { ok: true as const, caller: "twilio" as const } : { ok: false as const, caller: "twilio" as const };
  }
  const secret = input.webhookSecret || input.authToken;
  const sharedOk = Boolean(secret && input.webhookSecretHeader && input.webhookSecretHeader === secret);
  const signedOk = verifySignature(secret, input.rawBody, input.voiceopsSignature, input.mode);
  if (sharedOk || signedOk) return { ok: true as const, caller: "internal" as const };
  return { ok: false as const, caller: "internal" as const };
}

export function twilioWebhookKind(body: Record<string, unknown>): "inbound" | "status" | "ignore" {
  const callSid = scalar(body.CallSid ?? body.callSid);
  if (!callSid) return "ignore";
  const callbackSource = scalar(body.CallbackSource ?? body.callbackSource);
  const sequence = scalar(body.SequenceNumber ?? body.sequenceNumber);
  const direction = (scalar(body.Direction ?? body.direction) || "").toLowerCase();
  const status = (scalar(body.CallStatus ?? body.callStatus) || "").toLowerCase();
  if (callbackSource || sequence) return "status";
  if (direction === "inbound" && (status === "" || status === "ringing" || status === "queued" || status === "initiated")) return "inbound";
  if (status) return "status";
  if (direction === "inbound") return "inbound";
  return "ignore";
}

export function reduceTwilioCallStatus(
  current: CallSnapshot,
  event: { status: string; durationSec?: number },
  nowIso: string,
): { next: CallSnapshot; changed: boolean } {
  const status = event.status.trim().toLowerCase();
  const next: CallSnapshot = { ...current };
  if (current.status === "completed" || current.status === "failed") {
    if (status === "completed" && current.status === "completed" && event.durationSec != null && current.durationSec === 0) {
      next.durationSec = event.durationSec;
    }
    return { next, changed: snapshotChanged(current, next) };
  }
  if (STATUS_RANK[current.status] >= STATUS_RANK.wrap_up && (status === "initiated" || status === "ringing" || status === "queued" || status === "answered" || status === "in-progress" || TERMINAL_FAILURE.has(status))) {
    return { next, changed: false };
  }
  if (status === "initiated" || status === "ringing" || status === "queued") {
    if (STATUS_RANK[current.status] < STATUS_RANK.dialing) {
      next.status = "dialing";
      next.dialedAt = current.dialedAt ?? nowIso;
    }
  } else if (status === "answered" || status === "in-progress") {
    if (STATUS_RANK[current.status] < STATUS_RANK.in_progress) {
      next.status = "in_progress";
      next.startedAt = current.startedAt ?? nowIso;
      next.dialedAt = current.dialedAt ?? nowIso;
    }
  } else if (status === "completed") {
    if (event.durationSec != null) next.durationSec = event.durationSec;
    if (STATUS_RANK[current.status] < STATUS_RANK.wrap_up) {
      next.status = "wrap_up";
      next.endedAt = current.endedAt ?? nowIso;
    }
  } else if (TERMINAL_FAILURE.has(status)) {
    const reported = status === "cancelled" ? "canceled" : status;
    next.status = "failed";
    next.outcome = reported === "no-answer" ? "no_answer" : "failed";
    next.durationSec = 0;
    next.endedAt = current.endedAt ?? nowIso;
    next.failureReason = `Twilio reported ${reported}`;
    next.dialedAt = current.dialedAt ?? nowIso;
  }
  return { next, changed: snapshotChanged(current, next) };
}

export function politeHangupTwiml(companyName: string) {
  const who = companyName.trim() || "us";
  const message = `Thank you for calling ${who}. We are not able to take this call right now. Please try again later.`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(message)}</Say><Hangup/></Response>`;
}

export function emptyTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

export function elevenLabsInboundConfigured(input: { agentId?: string; apiKey?: string; mode: "mock" | "live"; testMode: boolean }) {
  return Boolean(input.agentId?.trim() && input.apiKey?.trim()) && input.mode === "live" && !input.testMode;
}

export function registerCallBody(input: { agentId: string; from: string; to: string }) {
  return {
    agent_id: input.agentId,
    from_number: input.from,
    to_number: input.to,
    direction: "inbound" as const,
  };
}

export function coerceRegisterCallTwiml(body: string) {
  const trimmed = body.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<Response")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && parsed.includes("<Response")) return parsed;
  } catch {
    return null;
  }
  return null;
}

export async function resolveInboundTwiml(input: {
  configured: boolean;
  companyName: string;
  agentId?: string;
  apiKey?: string;
  from: string;
  to: string;
  fetchImpl?: typeof fetch;
}) {
  if (!input.configured || !input.agentId?.trim() || !input.apiKey?.trim()) {
    return { twiml: politeHangupTwiml(input.companyName), registered: false };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(ELEVENLABS_REGISTER_CALL_URL, {
      method: "POST",
      headers: {
        "xi-api-key": input.apiKey,
        "Content-Type": "application/json",
        Accept: "application/xml, application/json, text/plain",
      },
      body: JSON.stringify(registerCallBody({ agentId: input.agentId, from: input.from, to: input.to })),
    });
    const text = await response.text();
    const twiml = response.ok ? coerceRegisterCallTwiml(text) : null;
    if (!twiml) return { twiml: politeHangupTwiml(input.companyName), registered: false };
    return { twiml, registered: true };
  } catch {
    return { twiml: politeHangupTwiml(input.companyName), registered: false };
  }
}

export function elevenLabsOutboundPayload(input: {
  agentId: string;
  agentPhoneNumberId: string;
  to: string;
  openingLine: string;
  consentScope?: string;
}) {
  const initiation: {
    conversation_config_override: { agent: { first_message: string } };
    dynamic_variables?: { consent_scope: string };
  } = {
    conversation_config_override: {
      agent: { first_message: input.openingLine },
    },
  };
  if (input.consentScope) initiation.dynamic_variables = { consent_scope: input.consentScope };
  return {
    agent_id: input.agentId,
    agent_phone_number_id: input.agentPhoneNumberId,
    to_number: input.to,
    conversation_initiation_client_data: initiation,
  };
}

export type TwilioWebhookDeps = {
  mode: "mock" | "live";
  authToken?: string;
  webhookSecret?: string;
  appUrl: string;
  agentId?: string;
  elevenKey?: string;
  testMode: boolean;
  companyName: string;
  fetchImpl?: typeof fetch;
  applyStatus: (body: unknown) => Promise<unknown>;
  logInbound: (params: Record<string, string>) => Promise<unknown>;
  onError?: (error: unknown, body: unknown) => Promise<void>;
};

export async function handleTwilioWebhook(request: Request, deps: TwilioWebhookDeps) {
  const text = await request.text();
  const contentType = request.headers.get("content-type") || "";
  let params: [string, string][] = [];
  let body: unknown;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const search = new URLSearchParams(text);
    params = [...search.entries()];
    body = Object.fromEntries(search);
  } else {
    try {
      body = JSON.parse(text || "{}") as unknown;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  }
  const record = asRecord(body);
  const urls = twilioValidationUrls({
    requestUrl: request.url,
    appUrl: deps.appUrl,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });
  const auth = authorizeTwilioWebhook({
    mode: deps.mode,
    authToken: deps.authToken,
    webhookSecret: deps.webhookSecret,
    rawBody: text,
    params,
    urls,
    twilioSignature: request.headers.get("x-twilio-signature"),
    voiceopsSignature: request.headers.get("x-voiceops-signature"),
    webhookSecretHeader: request.headers.get("x-webhook-secret"),
  });
  if (!auth.ok) {
    if (auth.caller === "twilio") return xml(emptyTwiml(), 401);
    return json({ error: "Invalid signature" }, 401);
  }

  const kind = twilioWebhookKind(record);
  const formParams = stringParams(record);
  const run = async () => {
    if (kind === "inbound" || (kind === "status" && (formParams.Direction || "").toLowerCase() === "inbound")) {
      await deps.logInbound(formParams);
    }
    if (kind === "status" || (kind === "inbound" && scalar(record.CallStatus ?? record.callStatus))) {
      await deps.applyStatus(record);
    }
  };
  try {
    await run();
  } catch (error) {
    await deps.onError?.(error, record);
  }

  if (auth.caller === "twilio" && kind === "inbound") {
    const resolved = await resolveInboundTwiml({
      configured: elevenLabsInboundConfigured({
        agentId: deps.agentId,
        apiKey: deps.elevenKey,
        mode: deps.mode,
        testMode: deps.testMode,
      }),
      companyName: deps.companyName,
      agentId: deps.agentId,
      apiKey: deps.elevenKey,
      from: formParams.From || formParams.Caller || "",
      to: formParams.To || formParams.Called || "",
      fetchImpl: deps.fetchImpl,
    });
    return xml(resolved.twiml);
  }
  if (auth.caller === "twilio") return xml(emptyTwiml());
  if (kind === "ignore") return json({ ok: true, ignored: true });
  return json({ ok: true });
}

function xml(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pathAndQuery(requestUrl: string) {
  const url = new URL(requestUrl);
  return `${url.pathname}${url.search}`;
}

function portVariants(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [url];
  }
  const path = `${parsed.pathname}${parsed.search}`;
  const variants = new Set<string>();
  variants.add(`${parsed.protocol}//${parsed.host}${path}`);
  if (parsed.port) variants.add(`${parsed.protocol}//${parsed.hostname}${path}`);
  else if (parsed.protocol === "https:") variants.add(`${parsed.protocol}//${parsed.hostname}:443${path}`);
  else if (parsed.protocol === "http:") variants.add(`${parsed.protocol}//${parsed.hostname}:80${path}`);
  return [...variants];
}

function firstHeaderValue(value: string | null | undefined) {
  return (value || "").split(",")[0]?.trim() || "";
}

function snapshotChanged(current: CallSnapshot, next: CallSnapshot) {
  return (
    current.status !== next.status ||
    current.outcome !== next.outcome ||
    current.startedAt !== next.startedAt ||
    current.endedAt !== next.endedAt ||
    current.dialedAt !== next.dialedAt ||
    current.durationSec !== next.durationSec ||
    current.failureReason !== next.failureReason
  );
}

function stringParams(record: Record<string, unknown>) {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const text = scalar(value);
    if (text) params[key] = text;
  }
  return params;
}

function scalar(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

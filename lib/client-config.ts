export type Env = Record<string, string | undefined>;

export const PRODUCT_NAME = "Voice Operations";
export const DEFAULT_BRAND_COLOR = "#2563eb";
export const DEFAULT_MARK = "V";
export const DEFAULT_TIMEZONE = "America/New_York";

export type SeedOffice = {
  name: string;
  type: "office" | "virtual";
  timezone: string;
};

export type ClientConfig = {
  companyName: string;
  subtitle: string;
  agentName: string;
  timezone: string;
  brandColor: string;
  logoUrl: string;
  mark: string;
  offices: SeedOffice[];
  knowledgeTitle: string;
  knowledgePath: string;
  sampleData: boolean;
  showDemoLogin: boolean;
  owner: { name: string; email: string; password: string };
  admin: { name: string; email: string; password: string };
  viewer: { name: string; email: string; password: string };
};

export function parseBrandColor(value: string | undefined): string | null {
  const color = (value || "").trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return color;
  return null;
}

export function brandColorOrDefault(value: string | undefined) {
  return parseBrandColor(value) || DEFAULT_BRAND_COLOR;
}

export function parseLogoUrl(value: string | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function logoUrlOrEmpty(value: string | undefined) {
  return parseLogoUrl(value) || "";
}

export function parseMark(value: string | undefined) {
  const mark = (value || "").trim().slice(0, 2);
  return mark || DEFAULT_MARK;
}

export function parseTimezone(value: string | undefined, fallback = DEFAULT_TIMEZONE) {
  const zone = (value || "").trim() || fallback;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

export function parseOffices(raw: string | undefined, timezone: string): SeedOffice[] {
  const fallback = parseTimezone(timezone);
  const text = (raw || "").trim();
  if (!text) {
    return [
      { name: "Main office", type: "office", timezone: fallback },
      { name: "Virtual", type: "virtual", timezone: fallback },
    ];
  }
  const offices = text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, type, zone] = part.split("|").map((piece) => piece.trim());
      return {
        name: name || "Office",
        type: type === "virtual" ? ("virtual" as const) : ("office" as const),
        timezone: parseTimezone(zone, fallback),
      };
    });
  return offices.length ? offices : [{ name: "Main office", type: "office", timezone: fallback }];
}

export function showDemoLogin(env: Env = process.env) {
  const flag = (env.SHOW_DEMO_LOGIN || "").trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  const url = env.APP_URL || "http://127.0.0.1:43123";
  return url.includes("localhost") || url.includes("127.0.0.1");
}

function text(env: Env, name: string, fallback: string) {
  const value = env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export type ConsentFieldConfig = {
  tier: string;
  revokedAt: string;
  purpose: string;
  timestamp: string;
  sourceUrl: string;
  version: string;
  phone: string;
  method: string;
  ip: string;
  userAgent: string;
  cookieCategories: string;
  revokedTag: string;
  dialOkTag: string;
  cacheTtlMs: number;
};

export function consentFieldConfig(env: Env = process.env): ConsentFieldConfig {
  const ttl = Number(env.GHL_CONSENT_FIELD_CACHE_MS ?? 3_600_000);
  return {
    tier: text(env, "GHL_CONSENT_TIER_FIELD", "contact.consent_tier"),
    revokedAt: text(env, "GHL_CONSENT_REVOKED_AT_FIELD", "contact.consent_revoked_at"),
    purpose: text(env, "GHL_CONSENT_PURPOSE_FIELD", "contact.consent_purpose"),
    timestamp: text(env, "GHL_CONSENT_TIMESTAMP_FIELD", "contact.consent_timestamp"),
    sourceUrl: text(env, "GHL_CONSENT_SOURCE_URL_FIELD", "contact.consent_source_url"),
    version: text(env, "GHL_CONSENT_VERSION_FIELD", "contact.consent_version"),
    phone: text(env, "GHL_CONSENT_PHONE_FIELD", "contact.consent_phone"),
    method: text(env, "GHL_CONSENT_METHOD_FIELD", "contact.consent_method"),
    ip: text(env, "GHL_CONSENT_IP_FIELD", "contact.consent_ip"),
    userAgent: text(env, "GHL_CONSENT_USER_AGENT_FIELD", "contact.consent_user_agent"),
    cookieCategories: text(env, "GHL_CONSENT_COOKIE_CATEGORIES_FIELD", "contact.cookie_consent_categories"),
    revokedTag: text(env, "GHL_CONSENT_REVOKED_TAG", "consent_revoked"),
    dialOkTag: text(env, "GHL_CONSENT_DIAL_OK_TAG", "avery_dial_ok"),
    cacheTtlMs: Number.isFinite(ttl) && ttl >= 0 ? ttl : 3_600_000,
  };
}

function flag(env: Env, name: string, fallback: boolean) {
  const value = (env[name] || "").trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

export function clientConfig(env: Env = process.env): ClientConfig {
  const companyName = text(env, "SEED_ORG_NAME", "Specificity Inc");
  const agentName = text(env, "SEED_AGENT_NAME", "Avery");
  const timezone = parseTimezone(env.SEED_TIMEZONE);
  const offices = parseOffices(env.SEED_OFFICES, timezone);
  return {
    companyName,
    subtitle: text(env, "SEED_ORG_SUBTITLE", "Voice Ops"),
    agentName,
    timezone,
    brandColor: brandColorOrDefault(env.SEED_BRAND_COLOR),
    logoUrl: logoUrlOrEmpty(env.SEED_LOGO_URL),
    mark: parseMark(env.SEED_MARK),
    offices,
    knowledgeTitle: text(env, "SEED_KNOWLEDGE_TITLE", `${companyName} voice agent`),
    knowledgePath: (env.SEED_KNOWLEDGE_PATH || "").trim(),
    sampleData: flag(env, "SEED_SAMPLE_DATA", true),
    showDemoLogin: showDemoLogin(env),
    owner: {
      name: text(env, "SEED_OWNER_NAME", "Alex Rivera"),
      email: text(env, "SEED_OWNER_EMAIL", "alex.rivera@specificityinc.example").toLowerCase(),
      password: text(env, "SEED_OWNER_PASSWORD", "VoiceOps!owner"),
    },
    admin: {
      name: text(env, "SEED_ADMIN_NAME", "Jordan Lee"),
      email: text(env, "SEED_ADMIN_EMAIL", "jordan.lee@specificityinc.example").toLowerCase(),
      password: text(env, "SEED_ADMIN_PASSWORD", "VoiceOps!admin"),
    },
    viewer: {
      name: text(env, "SEED_VIEWER_NAME", "Sam Patel"),
      email: text(env, "SEED_VIEWER_EMAIL", "sam.patel@specificityinc.example").toLowerCase(),
      password: text(env, "SEED_VIEWER_PASSWORD", "VoiceOps!viewer"),
    },
  };
}

export function defaultKnowledge(input: {
  companyName: string;
  agentName: string;
  timezone: string;
  offices: { name: string; timezone: string }[];
}) {
  const offices = input.offices.map((office) => `${office.name} (${office.timezone})`).join("; ") || `one office (${input.timezone})`;
  return `${input.companyName} voice agent knowledge
Default script for this workspace. Replace it with the client's own answers before any live dialing. It is not a script from another business.

Who you are
You are ${input.agentName}, the voice agent for ${input.companyName}. Say the name this workspace published. You call people who asked for a conversation or who already consented to a call. You book a short introduction. You do not give professional advice, and you do not invent facts that are not in this document.

How a call should go
1. Say who you are, the company name, and why you are calling.
2. Confirm you are speaking with the person on the account.
3. If it is a bad time, offer a callback and end the call.
4. If they want to talk, offer the next open appointment on that office's calendar.
5. Repeat the day, time, and time zone before you end.
6. Thank them and stop talking. Do not add a pitch after they have agreed or declined.

What you may say
- You are calling from ${input.companyName}.
- The introduction is a short conversation, by phone or video.
- Appointments are booked on the office calendar.
- If you do not know an answer, say so and offer to have someone follow up.

What you must not say
- Do not promise results, prices, or that an offer is right for them.
- Do not ask for a government ID, account number, or card number.
- Do not continue if someone says they are on a do-not-call list, asks you to stop, or says they did not consent.
- Do not pretend to be a government agency or another company.

Consent and calling rules
Every outbound call is checked again immediately before it is dialed. The dialer blocks a call when GoHighLevel consent is Low, missing, or unreadable, when consent was revoked, when the consent phone does not match the number being dialed, when the number is on the do-not-call list, when the local time is outside the published window, when the daily cap is used up, or when the lead has already been attempted the maximum number of times. If a check fails, do not dial.

Consent scope
The dialer sends a dynamic variable named consent_scope on every outbound call.
- scheduling_only: confirm you are speaking with the person, confirm they want a conversation, and book an appointment. Do not describe a product or a service.
- full: you may explain the product or service in this document, and you may book an appointment.
If consent_scope is missing or has any other value, say you cannot continue and end the call. In the ElevenLabs agent, reference this value as {{consent_scope}}.

Offices
This workspace starts with: ${offices}. The sample calendar is open on Friday from 10:00 AM to 5:00 PM and closed the other days. Replace those hours in Settings before a pilot. If a day is closed, offer the next open day. Do not invent a time.

Callback requests
If the person wants a later call, mark the outcome as a callback request. Do not book a meeting they did not agree to.

If a meeting is booked
Confirm the advisor name, the office, the format, and the time zone. Tell them the appointment will show on the office calendar. Then end the call.

If the call fails
A failed or unanswered call is logged with a zero duration. The worker, not you, decides whether a retry is scheduled.

Tone
Warm, brief, and plain. Short sentences. No pressure. If they are unsure, offer to stop.

After the call
The dialer writes a note back to GoHighLevel with the outcome, the duration, and a tag. If that write fails, it is retried and then shown under Failed jobs. You do not need to mention the CRM on the call.
`;
}

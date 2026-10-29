import type { ReadinessItem } from "./readiness";

export const GO_LIVE_GROUPS = ["Connect tools", "Set up Avery", "Calling rules", "Security"] as const;

export type GoLiveGroup = (typeof GO_LIVE_GROUPS)[number];

export type GoLiveCopy = {
  id: string;
  group: GoLiveGroup;
  title: string;
  helper: string;
  action: string | null;
  href: string | null;
  handledBySpecificity: boolean;
  ok: boolean;
  adminHint: string;
};

const COPY: Record<string, Omit<GoLiveCopy, "id" | "ok" | "adminHint">> = {
  "test-mode": {
    group: "Security",
    title: "Test mode",
    helper: "While this is on, Avery does not call real leads.",
    action: null,
    href: null,
    handledBySpecificity: false,
  },
  mode: {
    group: "Connect tools",
    title: "Live connections turned on",
    helper: "Specificity switches this on for you.",
    action: "Request",
    href: "/contact",
    handledBySpecificity: true,
  },
  schedule: {
    group: "Calling rules",
    title: "Calling schedule is on",
    helper: "New leads are called during your calling hours.",
    action: "Review",
    href: "/settings/calling",
    handledBySpecificity: false,
  },
  ghl: {
    group: "Connect tools",
    title: "Connect GoHighLevel",
    helper: "So Avery can read new leads and log calls.",
    action: "Connect",
    href: "/settings/integrations",
    handledBySpecificity: false,
  },
  eleven: {
    group: "Set up Avery",
    title: "Set up Avery's voice service",
    helper: "Specificity handles this.",
    action: "Request",
    href: "/contact",
    handledBySpecificity: true,
  },
  twilio: {
    group: "Connect tools",
    title: "Get a phone number",
    helper: "The number Avery calls from.",
    action: "Choose number",
    href: "/contact",
    handledBySpecificity: true,
  },
  agent: {
    group: "Set up Avery",
    title: "Publish Avery's script",
    helper: "The words Avery uses when someone answers.",
    action: "Edit script",
    href: "/settings/agent",
    handledBySpecificity: false,
  },
  voice: {
    group: "Set up Avery",
    title: "Pick Avery's voice",
    helper: "How Avery sounds on calls.",
    action: "Choose voice",
    href: "/settings/voice",
    handledBySpecificity: false,
  },
  rules: {
    group: "Calling rules",
    title: "Publish calling rules",
    helper: "Hours, a daily cap, and who Avery may call.",
    action: "Review rules",
    href: "/settings/calling-rules",
    handledBySpecificity: false,
  },
  consent: {
    group: "Calling rules",
    title: "Only call people who agreed",
    helper: "Avery skips leads with no consent on file.",
    action: "Review",
    href: "/settings/calling-rules",
    handledBySpecificity: false,
  },
  dnc: {
    group: "Calling rules",
    title: "Do-not-call list is on",
    helper: "Avery never dials numbers on your list.",
    action: "Review list",
    href: "/calls/do-not-call",
    handledBySpecificity: false,
  },
  hours: {
    group: "Calling rules",
    title: "Calling hours are on",
    helper: "Calls stay inside the lead's local hours.",
    action: "Review hours",
    href: "/settings/calling-rules",
    handledBySpecificity: false,
  },
  knowledge: {
    group: "Set up Avery",
    title: "Avery has something to say",
    helper: "Add prices, services, or common questions.",
    action: "Add a document",
    href: "/knowledge",
    handledBySpecificity: false,
  },
  office: {
    group: "Calling rules",
    title: "A location is ready",
    helper: "A time zone and calendar so meetings land in the right place.",
    action: "Review locations",
    href: "/settings/offices",
    handledBySpecificity: false,
  },
  totp: {
    group: "Security",
    title: "Turn on two-step sign-in",
    helper: "Protects your account and your leads.",
    action: "Turn on",
    href: "/settings/users",
    handledBySpecificity: false,
  },
  webhooks: {
    group: "Security",
    title: "Secure connections verified",
    helper: "Specificity handles this.",
    action: "Request",
    href: "/contact",
    handledBySpecificity: true,
  },
};

export function presentGoLiveItem(item: ReadinessItem): GoLiveCopy {
  const copy = COPY[item.id] ?? {
    group: "Security" as const,
    title: item.label,
    helper: "Specificity can help with this step.",
    action: null,
    href: null,
    handledBySpecificity: false,
  };
  return { id: item.id, ...copy, ok: item.ok, adminHint: item.hint };
}

export const GO_LIVE_PHRASE = "GO LIVE";

/** Why leaving test mode must be refused, or null when the switch is allowed. */
export function goLiveBlockReason(input: { confirm: string | undefined; items: ReadinessItem[] }): string | null {
  if ((input.confirm || "").trim() !== GO_LIVE_PHRASE) return "Type GO LIVE to confirm.";
  const progress = goLiveProgress(input.items);
  if (!progress.ready) return `Finish ${progress.remaining} more steps to go live.`;
  return null;
}

export function goLiveProgress(items: ReadinessItem[]) {
  const done = items.filter((item) => item.ok).length;
  const blocking = items.filter((item) => item.id !== "test-mode" && !item.ok);
  const next = blocking[0] ? presentGoLiveItem(blocking[0]) : null;
  return {
    done,
    total: items.length,
    remaining: blocking.length,
    nextTitle: next?.title ?? null,
    ready: blocking.length === 0,
  };
}

export function periodLabel(range: string) {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  if (range === "yesterday") return "Yesterday";
  return "Today";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type IntegrationTone = "gray" | "green" | "red" | "amber";

export function presentIntegration(input: {
  label: string;
  status: string;
  detail: string;
  checkedAt: Date | string | null;
  testMode: boolean;
  keysReady: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const checked = input.checkedAt ? new Date(input.checkedAt) : null;
  const age = checked ? now.getTime() - checked.getTime() : Number.POSITIVE_INFINITY;
  const stale = age > DAY_MS;
  const name = input.label;
  if (!input.keysReady || input.status === "unconfigured") {
    return {
      tone: "gray" as IntegrationTone,
      status: "Not connected",
      sentence: `${name} isn't linked yet.`,
      stale,
    };
  }
  if (stale) {
    return {
      tone: "amber" as IntegrationTone,
      status: "Unknown",
      sentence: `We haven't checked ${name} in over a day. Check now.`,
      stale,
    };
  }
  if (input.status === "down") {
    return {
      tone: "red" as IntegrationTone,
      status: "Problem",
      sentence: input.detail || `${name} did not respond.`,
      stale,
    };
  }
  if (input.testMode) {
    return {
      tone: "amber" as IntegrationTone,
      status: "Test only",
      sentence: `${name} answers in test mode. Real calls stay off until you go live.`,
      stale,
    };
  }
  return {
    tone: "green" as IntegrationTone,
    status: "Connected",
    sentence: `${name} is linked.`,
    stale,
  };
}

export function humanFieldLabel(internal: string, ghl: string) {
  const map: Record<string, string> = {
    phone: "Phone number",
    email: "Email address",
    "contact.name": "Contact name",
    "custom.voice_outcome": "Call outcome",
    "custom.consent": "Consent on file",
    tags: "Tags",
    Phone: "Phone number",
    Email: "Email address",
    Name: "Contact name",
    Outcome: "Call outcome",
    Consent: "Consent on file",
    Tags: "Tags",
  };
  return map[internal] || map[ghl] || internal;
}

export const CONSENT_OPTIONS = [
  { value: "high", title: "Written consent only", body: "The lead checked a consent box on your form. Safest.", recommended: true },
  { value: "medium", title: "Clear opt-in", body: "The lead asked to be contacted, in writing or on a form.", recommended: false },
  { value: "low", title: "Any opt-in", body: "Includes verbal or imported opt-ins.", recommended: false },
] as const;

export function actorLabel(name: string) {
  if (!name || name === "Voice Operations" || name === "System") return "System";
  return name;
}

export function integrationKeyId(provider: string) {
  if (provider === "ghl") return "ghl";
  if (provider === "elevenlabs") return "eleven";
  if (provider === "twilio") return "twilio";
  return "";
}

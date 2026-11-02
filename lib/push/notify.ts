import { flagOn, type Env } from "../demo/flags";
import { inQuietHours } from "../marketing/channels/feed";

/** Off unless PUSH_NOTIFICATIONS is explicitly on. Delivery stays a log line. */
export function pushNotificationsEnabled(env: Env = process.env) {
  return flagOn(env, "PUSH_NOTIFICATIONS");
}

export type PushPrefs = {
  optedIn: boolean;
  quietStartHour: number;
  quietEndHour: number;
  urgentOutageBreaksQuiet: boolean;
  timeZone: string;
};

export type PushCandidate = {
  id: string;
  severity: "urgent" | "decision" | "note" | string;
  kind: string;
  title: string;
  body: string;
};

export type PushPlan =
  | { action: "off" }
  | { action: "skip"; reason: string; itemId: string }
  | { action: "would_send"; itemId: string; title: string; body: string; channel: "push"; breaksQuietHours: boolean };

function clampHour(value: number, fallback: number) {
  if (!Number.isInteger(value) || value < 0 || value > 23) return fallback;
  return value;
}

function hourFromEnv(env: Env, name: string, fallback: number) {
  const raw = (env[name] || "").trim();
  if (!raw) return fallback;
  return clampHour(Number(raw), fallback);
}

/** Quiet hours default to 10 PM–7 AM. Urgent outages break through unless configured off. */
export function defaultPushPrefs(env: Env = process.env): PushPrefs {
  const breakRaw = (env.PUSH_OUTAGE_BREAKS_QUIET || "").trim().toLowerCase();
  const urgentOutageBreaksQuiet = breakRaw === "off" || breakRaw === "false" || breakRaw === "0" || breakRaw === "no" ? false : true;
  return {
    optedIn: false,
    quietStartHour: hourFromEnv(env, "PUSH_QUIET_START", 22),
    quietEndHour: hourFromEnv(env, "PUSH_QUIET_END", 7),
    urgentOutageBreaksQuiet,
    timeZone: (env.PUSH_TIME_ZONE || "").trim() || "America/New_York",
  };
}

export function parsePushPrefs(input: Partial<PushPrefs>, env: Env = process.env): PushPrefs {
  const defaults = defaultPushPrefs(env);
  return {
    optedIn: Boolean(input.optedIn),
    quietStartHour: clampHour(Number(input.quietStartHour), defaults.quietStartHour),
    quietEndHour: clampHour(Number(input.quietEndHour), defaults.quietEndHour),
    urgentOutageBreaksQuiet: input.urgentOutageBreaksQuiet !== false,
    timeZone: (input.timeZone || "").trim() || defaults.timeZone,
  };
}

export function isUrgentOutage(item: Pick<PushCandidate, "severity" | "kind" | "title">) {
  if (item.severity !== "urgent") return false;
  if (item.kind === "outage") return true;
  return /outage|page is down|failed checks/i.test(item.title);
}

export function planPush(input: { enabled: boolean; prefs: PushPrefs; item: PushCandidate; now: Date }): PushPlan {
  if (!input.enabled) return { action: "off" };
  if (!input.prefs.optedIn) return { action: "skip", reason: "Opt-in is off for this person.", itemId: input.item.id };
  if (input.item.severity !== "urgent") return { action: "skip", reason: "Only urgent items are pushed.", itemId: input.item.id };
  const quiet = inQuietHours(input.now, input.prefs.timeZone, input.prefs.quietStartHour, input.prefs.quietEndHour);
  const outage = isUrgentOutage(input.item);
  if (quiet && !(outage && input.prefs.urgentOutageBreaksQuiet)) {
    return { action: "skip", reason: "Quiet hours. This waits until morning.", itemId: input.item.id };
  }
  return {
    action: "would_send",
    itemId: input.item.id,
    title: input.item.title,
    body: input.item.body,
    channel: "push",
    breaksQuietHours: quiet,
  };
}

/** Does not call a push service. The log line is the whole delivery. */
export function deliverPush(plan: PushPlan, log: (line: string) => void = (line) => console.info(line)) {
  if (plan.action !== "would_send") return { sent: false as const, logged: null };
  log(`would send push: ${plan.title}`);
  return { sent: false as const, logged: "would send" as const };
}

export function pushHttpStatus(input: { enabled: boolean; signedIn: boolean; kind: string | null; share: boolean }) {
  if (!input.enabled) return 404;
  if (input.share) return 403;
  if (!input.signedIn) return 401;
  if (input.kind !== "super_admin" && input.kind !== "account_manager") return 403;
  return 200;
}

export async function notifyAccountManager(input: {
  env?: Env;
  userId: string;
  items: PushCandidate[];
  now?: Date;
  loadPrefs: () => Promise<PushPrefs | null>;
  log?: (line: string) => void;
}) {
  const env = input.env ?? process.env;
  if (!pushNotificationsEnabled(env)) return [];
  const stored = await input.loadPrefs();
  const prefs = stored ?? defaultPushPrefs(env);
  const now = input.now ?? new Date();
  return input.items.map((item) => deliverPush(planPush({ enabled: true, prefs, item, now }), input.log));
}

export function hourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${suffix}`;
}

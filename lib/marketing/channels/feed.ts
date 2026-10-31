export type FeedSeverity = "urgent" | "decision" | "note";

export type LiveFeedItem = {
  id: string;
  clientId: string;
  clientName: string;
  channel: string;
  severity: FeedSeverity;
  title: string;
  reason: string;
  decisionId: string | null;
  createdAt: string;
  unread: boolean;
  driver: string;
  magnitude: number;
};

export type FeedViewer = {
  role: "super_admin" | "account_manager" | "other";
  assignedClientIds: string[];
};

/** Server scope. An account manager only receives assigned clients. */
export function scopeLiveFeed(items: LiveFeedItem[], viewer: FeedViewer) {
  if (viewer.role === "super_admin") return items;
  if (viewer.role === "account_manager") {
    const allowed = new Set(viewer.assignedClientIds);
    return items.filter((item) => allowed.has(item.clientId));
  }
  return [];
}

export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 7;
export const URGENT_CHANNEL = "email" as const;

export function hourInZone(date: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(date);
  return Number(hour);
}

export function inQuietHours(date: Date, timeZone: string, start = QUIET_START_HOUR, end = QUIET_END_HOUR) {
  const hour = hourInZone(date, timeZone);
  if (!Number.isFinite(hour)) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** Urgent still alerts during quiet hours. Everything else waits for the morning recap. */
export function deliveryPlan(item: Pick<LiveFeedItem, "severity">, now: Date, timeZone: string) {
  if (item.severity === "urgent") return { when: "now" as const, channel: URGENT_CHANNEL, breaksQuietHours: true };
  if (inQuietHours(now, timeZone)) return { when: "recap" as const, channel: "in_app" as const, breaksQuietHours: false };
  if (item.severity === "note") return { when: "bell" as const, channel: "in_app" as const, breaksQuietHours: false };
  return { when: "now" as const, channel: "in_app" as const, breaksQuietHours: false };
}

export function urgentEmail(optIn: boolean) {
  return optIn ? URGENT_CHANNEL : ("in_app" as const);
}

const FIFTEEN_MIN = 15 * 60 * 1000;

export function batchNotes(items: LiveFeedItem[], now = Date.now()) {
  const notes = items.filter((item) => item.severity === "note" && now - Date.parse(item.createdAt) <= FIFTEEN_MIN);
  const rest = items.filter((item) => !notes.includes(item));
  if (notes.length < 2) return items;
  const newest = notes[0];
  if (!newest) return items;
  const batched: LiveFeedItem = {
    ...newest,
    id: `batch-${newest.id}`,
    title: `${notes.length} batched`,
    reason: notes.map((item) => item.title).join(" "),
    magnitude: notes.reduce((sum, item) => sum + item.magnitude, 0),
  };
  return [batched, ...rest];
}

export function toastAllowed(input: { clientId: string; recent: { clientId: string; at: number }[]; now: number; dailyCount: number }) {
  if (input.dailyCount >= 20) return false;
  const last = input.recent.filter((row) => row.clientId === input.clientId).sort((a, b) => b.at - a.at)[0];
  if (last && input.now - last.at < 10 * 60 * 1000) return false;
  return true;
}

export function sameDriverMuted(previous: { driver: string; at: string; magnitude: number } | null, next: { driver: string; at: string; magnitude: number }) {
  if (!previous || previous.driver !== next.driver) return false;
  const age = Date.parse(next.at) - Date.parse(previous.at);
  if (age > 24 * 60 * 60 * 1000) return false;
  if (previous.magnitude <= 0) return true;
  return next.magnitude < previous.magnitude * 1.5;
}

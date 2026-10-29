import { addDaysISO, parseHHMM, zonedDayBounds, zonedISODate, zonedParts, zonedTimeToUtc } from "../time";

/** First response is late at this many seconds unless a client sets another target. */
export const DEFAULT_TARGET_SECONDS = 30;
/** Second alert. A lead never gets more than a warning plus this critical. */
export const DEFAULT_CRITICAL_SECONDS = 15 * 60;
export const DEFAULT_OPEN_TIME = "08:00";
export const DEFAULT_CLOSE_TIME = "21:00";
export const PUSH_GAP_MS = 15 * 60 * 1000;
export const UNDO_MS = 30_000;
export const LANDING_MATCH_MS = 24 * 60 * 60 * 1000;

export const EMPTY_WAITING = "No one waiting. Nice work.";
export const EMPTY_LEADS = "No leads yet. They appear here as soon as your form or calls bring one in.";
export const ERROR_COPY = "Can't read call activity right now, so timers may be wrong.";
export const SAVED_COPY = "Saved. The target is updated.";

export type ClockSource = "landing" | "form_submit" | "call_start";
export type TouchChannel = "human" | "voice_ai" | "sms";
export type SpeedBand = "ok" | "late" | "very_late" | "queued";

export type SlaSettings = {
  targetSeconds: number;
  criticalSeconds: number;
  openTime: string;
  closeTime: string;
  timeZone: string;
};

export type SpeedLead = {
  id: string;
  workspaceId: string;
  name: string;
  phone: string;
  leadSource: string;
  clockStartAt: Date;
  clockSource: ClockSource;
  slaStartAt: Date;
  afterHours: boolean;
  firstTouchAt: Date | null;
  channel: TouchChannel | null;
  seconds: number | null;
  mutedUntil: Date | null;
  landedAt: Date | null;
  submittedAt: Date | null;
  callStartedAt: Date | null;
  alerts: { severity: "warning" | "critical"; state: "open" | "resolved" | "muted" }[];
};

export type SpeedLeadView = {
  id: string;
  name: string;
  source: string;
  phone: string;
  line: string;
  spoken: string;
  band: SpeedBand;
  bandLabel: string;
  clockLabel: string | null;
  clockDetail: string;
  afterHoursNote: string | null;
  waiting: boolean;
  contacted: boolean;
  landedAt: string | null;
  firstTouchAt: string | null;
  channelLabel: string | null;
};

export type SpeedDashboardView = {
  targetSeconds: number;
  criticalSeconds: number;
  medianSeconds: number | null;
  withinTargetPercent: number | null;
  goalLabel: string;
  headline: string;
  waiting: SpeedLeadView[];
  answeredToday: SpeedLeadView[];
  slowest: SpeedLeadView[];
};

export type SpeedFire = {
  severity: "warning" | "critical";
  code: "speed_to_lead_late" | "speed_to_lead_critical";
  title: string;
  summary: string;
  dedupeKey: string;
};

export type LeadPlan = {
  leadId: string;
  resolve: boolean;
  fires: SpeedFire[];
  card: { title: string; summary: string; observed: string; baseline: string } | null;
  view: SpeedLeadView;
  elapsed: number;
};

const CLOCK_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function defaultSla(timeZone = "America/New_York"): SlaSettings {
  return {
    targetSeconds: DEFAULT_TARGET_SECONDS,
    criticalSeconds: DEFAULT_CRITICAL_SECONDS,
    openTime: DEFAULT_OPEN_TIME,
    closeTime: DEFAULT_CLOSE_TIME,
    timeZone: timeZone || "America/New_York",
  };
}

export function clampTarget(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_TARGET_SECONDS;
  return Math.min(24 * 60 * 60, Math.max(1, Math.floor(value)));
}

export function thresholds(targetSeconds: number, criticalSeconds: number) {
  const target = clampTarget(targetSeconds);
  const critical = Math.max(Number.isFinite(criticalSeconds) ? Math.floor(criticalSeconds) : DEFAULT_CRITICAL_SECONDS, target * 3, target + 1);
  return { targetSeconds: target, criticalSeconds: critical };
}

function clockFace(value: string, fallback: string) {
  return CLOCK_HHMM.test(value) ? value : fallback;
}

export function normalizeSla(input: Partial<SlaSettings> | null | undefined, timeZone = "America/New_York"): SlaSettings {
  const base = defaultSla(input?.timeZone || timeZone);
  const openTime = clockFace(input?.openTime || base.openTime, base.openTime);
  const closeTime = clockFace(input?.closeTime || base.closeTime, base.closeTime);
  const limits = thresholds(input?.targetSeconds ?? base.targetSeconds, input?.criticalSeconds ?? base.criticalSeconds);
  return { ...limits, openTime, closeTime, timeZone: base.timeZone };
}

export function dedupeKey(workspaceId: string, leadId: string) {
  return `${workspaceId}:speed_to_lead:${leadId}`;
}

export function elapsedSeconds(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

export function parseStamp(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Ignore stamps more than 5 minutes in the future or older than 7 days. */
export function usableStamp(value: unknown, now: Date): Date | null {
  const date = parseStamp(value);
  if (!date) return null;
  if (date.getTime() > now.getTime() + 5 * 60 * 1000) return null;
  if (now.getTime() - date.getTime() > 7 * 24 * 60 * 60 * 1000) return null;
  return date;
}

export function resolveClock(input: { landedAt?: unknown; submittedAt?: unknown; callStartedAt?: unknown; now: Date }) {
  const landedAt = usableStamp(input.landedAt, input.now);
  const submittedAt = usableStamp(input.submittedAt, input.now);
  const callStartedAt = usableStamp(input.callStartedAt, input.now);
  if (landedAt) return { clockStartAt: landedAt, clockSource: "landing" as const, landedAt, submittedAt, callStartedAt };
  if (submittedAt) return { clockStartAt: submittedAt, clockSource: "form_submit" as const, landedAt, submittedAt, callStartedAt };
  if (callStartedAt) return { clockStartAt: callStartedAt, clockSource: "call_start" as const, landedAt, submittedAt, callStartedAt };
  return { clockStartAt: input.now, clockSource: "form_submit" as const, landedAt: null, submittedAt: null, callStartedAt: null };
}

export function clockSourceLabel(source: ClockSource): string | null {
  if (source === "landing") return null;
  if (source === "form_submit") return "from form submit";
  return "from call start";
}

export function clockSourceDetail(source: ClockSource) {
  if (source === "landing") return "from page landing";
  if (source === "form_submit") return "from form submit";
  return "from call start";
}

export function businessWindow(clockStart: Date, timeZone: string, open = DEFAULT_OPEN_TIME, close = DEFAULT_CLOSE_TIME) {
  const openTime = clockFace(open, DEFAULT_OPEN_TIME);
  const closeTime = clockFace(close, DEFAULT_CLOSE_TIME);
  const openMin = parseHHMM(openTime);
  const closeMin = parseHHMM(closeTime);
  if (openMin >= closeMin) return { slaStartAt: clockStart, afterHours: false };
  const parts = zonedParts(clockStart, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  if (minutes >= openMin && minutes < closeMin) return { slaStartAt: clockStart, afterHours: false };
  const iso = zonedISODate(clockStart, timeZone);
  const todayOpen = zonedTimeToUtc(`${iso}T${openTime}`, timeZone);
  const slaStartAt = clockStart.getTime() < todayOpen.getTime() ? todayOpen : zonedTimeToUtc(`${addDaysISO(iso, 1)}T${openTime}`, timeZone);
  return { slaStartAt, afterHours: true };
}

export function isQuietHours(now: Date, timeZone: string, open = DEFAULT_OPEN_TIME, close = DEFAULT_CLOSE_TIME) {
  const openMin = parseHHMM(clockFace(open, DEFAULT_OPEN_TIME));
  const closeMin = parseHHMM(clockFace(close, DEFAULT_CLOSE_TIME));
  if (openMin >= closeMin) return false;
  const parts = zonedParts(now, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= closeMin || minutes < openMin;
}

export function canNotify(input: { severity: "warning" | "critical"; now: Date; timeZone: string; openTime: string; closeTime: string; lastPushAt: Date | null }) {
  if (input.severity === "warning" && isQuietHours(input.now, input.timeZone, input.openTime, input.closeTime)) return false;
  if (input.lastPushAt && input.now.getTime() - input.lastPushAt.getTime() < PUSH_GAP_MS) return false;
  return true;
}

export function telHref(phone: string) {
  const compact = phone.trim().replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${compact}`;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

const LANDING_KEY = /land(ed|ing)|speed_to_lead_landed_at|page_landed_at/i;

function collectLandingValues(node: Record<string, unknown>, into: unknown[]) {
  for (const key of ["landedAt", "landed_at", "landingAt", "landing_at", "speed_to_lead_landed_at", "pageLandedAt", "page_landed_at"]) {
    if (key in node) into.push(node[key]);
  }
  const fields = node.customFields ?? node.customField ?? node.fields;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      const row = asRecord(field);
      const key = text(row.key || row.id || row.name || row.fieldKey || row.field_name);
      if (key && LANDING_KEY.test(key)) into.push(row.value ?? row.field_value ?? row.fieldValue);
    }
  } else if (fields && typeof fields === "object") {
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      if (LANDING_KEY.test(key)) into.push(value);
    }
  }
}

/** Landing time from a form hidden field or a landing/session event body. */
export function readLandingStamp(body: unknown, now = new Date()) {
  const root = asRecord(body);
  const contact = asRecord(root.contact ?? root);
  const values: unknown[] = [];
  collectLandingValues(root, values);
  collectLandingValues(contact, values);
  let landedAt: Date | null = null;
  for (const value of values) {
    const stamp = usableStamp(value, now);
    if (stamp && (!landedAt || stamp.getTime() < landedAt.getTime())) landedAt = stamp;
  }
  const sessionKey = text(contact.sessionKey || contact.session_id || contact.sessionId || root.sessionKey || root.sessionId || root.session_id).slice(0, 120);
  const leadSource = text(contact.leadSource || contact.formName || contact.source || root.leadSource || root.source).slice(0, 120);
  return { landedAt, sessionKey, leadSource };
}

function channelLabel(channel: TouchChannel | null) {
  if (channel === "human") return "A person";
  if (channel === "voice_ai") return "Avery";
  if (channel === "sms") return "Text";
  return null;
}

function bandFor(elapsed: number, target: number, critical: number, queued: boolean): { band: SpeedBand; bandLabel: string } {
  if (queued) return { band: "queued", bandLabel: "Queued" };
  if (elapsed >= critical) return { band: "very_late", bandLabel: "Very late" };
  if (elapsed >= target) return { band: "late", bandLabel: "Late" };
  return { band: "ok", bandLabel: "OK" };
}

function responseLine(input: { seconds: number; contacted: boolean; queued: boolean; clockLabel: string | null; afterHours: boolean }) {
  if (input.queued) {
    return {
      line: "Came in after hours",
      spoken: "Came in after hours. Queued until 8 AM.",
    };
  }
  const unit = input.seconds === 1 ? "second" : "seconds";
  const base = input.contacted ? `Contacted in ${input.seconds}s` : `Waiting ${input.seconds}s`;
  const spokenBase = input.contacted ? `contacted in ${input.seconds} ${unit}` : `waiting ${input.seconds} ${unit}`;
  const extra = [input.clockLabel, input.afterHours ? "Came in after hours" : null].filter(Boolean);
  return {
    line: extra.length ? `${base} · ${extra.join(" · ")}` : base,
    spoken: extra.length ? `${spokenBase}, ${extra.join(", ")}` : spokenBase,
  };
}

export function describeLead(lead: SpeedLead, sla: SlaSettings, now: Date) {
  const limits = thresholds(sla.targetSeconds, sla.criticalSeconds);
  const muted = Boolean(lead.mutedUntil && lead.mutedUntil.getTime() > now.getTime());
  const contacted = lead.firstTouchAt != null;
  const queued = !contacted && now.getTime() < lead.slaStartAt.getTime();
  const end = lead.firstTouchAt ?? now;
  const elapsed = queued ? 0 : elapsedSeconds(lead.slaStartAt, end.getTime() < lead.slaStartAt.getTime() ? lead.slaStartAt : end);
  const measured = lead.seconds != null && contacted ? lead.seconds : elapsed;
  const { band, bandLabel } = bandFor(measured, limits.targetSeconds, limits.criticalSeconds, queued);
  const clockLabel = clockSourceLabel(lead.clockSource);
  const copy = responseLine({ seconds: measured, contacted, queued, clockLabel, afterHours: lead.afterHours });
  const view: SpeedLeadView = {
    id: lead.id,
    name: lead.name,
    source: lead.leadSource,
    phone: lead.phone,
    line: copy.line,
    spoken: copy.spoken,
    band,
    bandLabel: muted && !contacted ? "Muted" : bandLabel,
    clockLabel,
    clockDetail: clockSourceDetail(lead.clockSource),
    afterHoursNote: lead.afterHours ? "Came in after hours" : null,
    waiting: !contacted,
    contacted,
    landedAt: lead.landedAt ? lead.landedAt.toISOString() : null,
    firstTouchAt: lead.firstTouchAt ? lead.firstTouchAt.toISOString() : null,
    channelLabel: channelLabel(lead.channel),
  };
  const has = (severity: "warning" | "critical") => lead.alerts.some((alert) => alert.severity === severity);
  const fires: SpeedFire[] = [];
  const key = dedupeKey(lead.workspaceId, lead.id);
  const title = `${lead.name} ${contacted ? "contacted" : "waiting"} ${measured}s (${lead.leadSource})`;
  const summary = `${copy.spoken}. Target is ${limits.targetSeconds} seconds.`;
  if (!contacted && !muted && !queued) {
    const quiet = isQuietHours(now, sla.timeZone, sla.openTime, sla.closeTime);
    if (measured >= limits.targetSeconds && !has("warning") && !has("critical") && !quiet) {
      fires.push({ severity: "warning", code: "speed_to_lead_late", title, summary, dedupeKey: key });
    }
    if (measured >= limits.criticalSeconds && !has("critical")) {
      fires.push({ severity: "critical", code: "speed_to_lead_critical", title, summary, dedupeKey: key });
    }
  }
  const late = !contacted && !queued && !muted && measured >= limits.targetSeconds;
  const card = late
    ? { title, summary, observed: String(measured), baseline: String(limits.targetSeconds) }
    : null;
  return { view, elapsed: measured, fires: fires.slice(0, 2), resolve: contacted && lead.alerts.some((alert) => alert.state === "open"), card, muted, queued };
}

export function planSpeedToLead(leads: SpeedLead[], slaInput: SlaSettings, now: Date) {
  const sla = normalizeSla(slaInput);
  const plans: LeadPlan[] = leads.map((lead) => {
    const described = describeLead(lead, sla, now);
    return {
      leadId: lead.id,
      resolve: described.resolve,
      fires: described.fires,
      card: described.card,
      view: described.view,
      elapsed: described.elapsed,
    };
  });
  const { start, end } = zonedDayBounds(now, sla.timeZone);
  const cohort = leads.filter((lead) => lead.slaStartAt >= start && lead.slaStartAt < end);
  const describedCohort = cohort.map((lead) => describeLead(lead, sla, now));
  const contacted = describedCohort.filter((row) => row.view.contacted);
  const medianSeconds = median(contacted.map((row) => row.elapsed));
  const missedWaiting = describedCohort.filter((row) => row.view.waiting && !row.queued && row.elapsed >= sla.targetSeconds);
  const hits = contacted.filter((row) => row.elapsed <= sla.targetSeconds);
  const decided = hits.length + contacted.filter((row) => row.elapsed > sla.targetSeconds).length + missedWaiting.length;
  const withinTargetPercent = decided ? Math.round((hits.length / decided) * 100) : null;
  const waiting = plans.filter((plan) => plan.view.waiting).sort((a, b) => b.elapsed - a.elapsed);
  const answeredToday = plans
    .filter((plan) => plan.view.contacted && cohort.some((lead) => lead.id === plan.leadId))
    .sort((a, b) => b.elapsed - a.elapsed);
  const slowest = [...plans].filter((plan) => plan.view.band !== "queued").sort((a, b) => b.elapsed - a.elapsed).slice(0, 5);
  const goalLabel = `goal: under ${sla.targetSeconds}s`;
  const headline =
    medianSeconds == null
      ? `Median first response today: not enough responses yet (${goalLabel})`
      : `Median first response today: ${medianSeconds}s (${goalLabel})`;
  const summary: SpeedDashboardView = {
    targetSeconds: sla.targetSeconds,
    criticalSeconds: sla.criticalSeconds,
    medianSeconds,
    withinTargetPercent,
    goalLabel,
    headline,
    waiting: waiting.map((plan) => plan.view),
    answeredToday: answeredToday.map((plan) => plan.view),
    slowest: slowest.map((plan) => plan.view),
  };
  return { plans, summary, sla };
}

export function touchSeconds(slaStartAt: Date, at: Date) {
  if (at.getTime() <= slaStartAt.getTime()) return 0;
  return elapsedSeconds(slaStartAt, at);
}

export function undoStillOpen(touchedAt: Date | null, now: Date) {
  if (!touchedAt) return false;
  return now.getTime() - touchedAt.getTime() <= UNDO_MS;
}

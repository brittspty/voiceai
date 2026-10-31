import { forbiddenClientKeys, collectKeys } from "./marketing/client-view";
import { addDaysISO } from "./time";
import { envEnabled, type Env } from "./public-routing";

/**
 * Public sign-in totals. Off unless LOGIN_ANALYTICS is explicitly on.
 * Pending Jason: the minimum client count defaults to 5 (UI Bot). Platform Builder used 3.
 * Set LOGIN_ANALYTICS_MIN_CLIENTS to change it. Figures built from fewer clients are omitted.
 */
export const PUBLIC_DELAY_MS = 15 * 60 * 1000;
export const PUBLIC_CACHE_MS = 60 * 1000;
export const PUBLIC_SPARKLINE_DAYS = 30;
export const DEFAULT_MIN_CLIENTS = 5;
export const ANALYTICS_ZONE = "America/New_York";
export const COUNT_UP_MS = 900;

export function loginAnalyticsEnabled(env: Env = process.env) {
  return envEnabled(env.LOGIN_ANALYTICS);
}

export function loginAnalyticsMinClients(env: Env = process.env) {
  const raw = (env.LOGIN_ANALYTICS_MIN_CLIENTS || "").trim();
  if (!raw) return DEFAULT_MIN_CLIENTS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_MIN_CLIENTS;
  return parsed;
}

export function publicAsOf(now: Date) {
  return new Date(now.getTime() - PUBLIC_DELAY_MS);
}

/** Nearest 10. Zero and negative stay zero so a tiny bucket cannot be read back. */
export function roundPublicCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / 10) * 10;
}

export function countUpValue(elapsedMs: number, target: number, reduced: boolean) {
  if (reduced || elapsedMs >= COUNT_UP_MS) return target;
  const t = Math.max(0, elapsedMs) / COUNT_UP_MS;
  const eased = 1 - (1 - t) ** 3;
  return Math.round(target * eased);
}

export type DayCount = { date: string; count: number };

export type LoginContribution = {
  workspaceId: string;
  name?: string;
  leads: DayCount[];
  verifiedHuman: DayCount[];
  callsAnswered: DayCount[];
  activeCampaigns: number;
};

export type PublicFigure = { hidden: true } | { hidden: false; value: number; series: number[] };

export type PublicLoginAnalytics = {
  window: "month";
  delayedMinutes: number;
  threshold: number;
  updatedMinutesAgo: number;
  metrics: {
    leads: PublicFigure;
    verifiedHumanConversions: PublicFigure;
    callsAnswered: PublicFigure;
    activeCampaigns: PublicFigure;
  };
};

const BANNED_PUBLIC_KEY = /workspace|client|name|email|phone|spend|budget|cpc|cpm|cpa|cpl|roas|cost|currency|revenue|external|secret|logo/i;

export function monthStartISO(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function sparklineDates(endISO: string) {
  const dates: string[] = [];
  for (let age = PUBLIC_SPARKLINE_DAYS - 1; age >= 0; age -= 1) dates.push(addDaysISO(endISO, -age));
  return dates;
}

function inWindow(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function sumDays(rows: DayCount[], start: string, end: string) {
  return rows.reduce((sum, row) => (inWindow(row.date, start, end) ? sum + row.count : sum), 0);
}

function figureFrom(input: {
  rowsByClient: DayCount[][];
  monthStart: string;
  end: string;
  dates: string[];
  threshold: number;
  flat?: number;
  contributors?: number;
}): PublicFigure {
  if (input.flat != null && input.contributors != null) {
    if (input.contributors < input.threshold) return { hidden: true };
    const value = roundPublicCount(input.flat);
    return { hidden: false, value, series: input.dates.map(() => value) };
  }
  let contributors = 0;
  for (const rows of input.rowsByClient) {
    if (sumDays(rows, input.monthStart, input.end) > 0) contributors += 1;
  }
  if (contributors < input.threshold) return { hidden: true };
  const series = input.dates.map((date) => {
    let dayContributors = 0;
    let total = 0;
    for (const rows of input.rowsByClient) {
      const count = sumDays(rows, date, date);
      if (count > 0) dayContributors += 1;
      total += count;
    }
    if (dayContributors < input.threshold) return 0;
    return roundPublicCount(total);
  });
  const value = roundPublicCount(input.rowsByClient.reduce((sum, rows) => sum + sumDays(rows, input.monthStart, input.end), 0));
  return { hidden: false, value, series };
}

export function buildPublicLoginAnalytics(input: {
  contributions: LoginContribution[];
  now: Date;
  threshold?: number;
  zoneISO: string;
}): PublicLoginAnalytics {
  const asOf = publicAsOf(input.now);
  const end = input.zoneISO;
  const monthStart = monthStartISO(end);
  const dates = sparklineDates(end);
  const threshold = input.threshold ?? DEFAULT_MIN_CLIENTS;
  const fresh = input.contributions.map((row) => ({
    leads: row.leads.filter((point) => point.date <= end),
    verifiedHuman: row.verifiedHuman.filter((point) => point.date <= end),
    callsAnswered: row.callsAnswered.filter((point) => point.date <= end),
    activeCampaigns: row.activeCampaigns,
  }));
  const delayedMinutes = Math.max(15, Math.round((input.now.getTime() - asOf.getTime()) / 60000));
  return {
    window: "month",
    delayedMinutes,
    threshold,
    updatedMinutesAgo: delayedMinutes,
    metrics: {
      leads: figureFrom({ rowsByClient: fresh.map((row) => row.leads), monthStart, end, dates, threshold }),
      verifiedHumanConversions: figureFrom({ rowsByClient: fresh.map((row) => row.verifiedHuman), monthStart, end, dates, threshold }),
      callsAnswered: figureFrom({ rowsByClient: fresh.map((row) => row.callsAnswered), monthStart, end, dates, threshold }),
      activeCampaigns: figureFrom({
        rowsByClient: [],
        monthStart,
        end,
        dates,
        threshold,
        flat: fresh.reduce((sum, row) => sum + Math.max(0, row.activeCampaigns), 0),
        contributors: fresh.filter((row) => row.activeCampaigns > 0).length,
      }),
    },
  };
}

export function publicAnalyticsViolations(value: unknown, forbiddenText: string[] = []) {
  const keys = [...new Set([...forbiddenClientKeys(value), ...collectKeys(value).filter((key) => BANNED_PUBLIC_KEY.test(key))])];
  const text = JSON.stringify(value);
  const leaked = forbiddenText.filter((item) => item.trim().length >= 3 && text.includes(JSON.stringify(item.trim())));
  const money = text.includes("$");
  return { keys, leaked, money };
}

export function assertPublicAnalytics(value: unknown, forbiddenText: string[] = []) {
  const violations = publicAnalyticsViolations(value, forbiddenText);
  if (violations.keys.length || violations.leaked.length || violations.money) {
    throw new Error("Public analytics payload is not anonymous.");
  }
}

export type RateLimiter = {
  allow(key: string, now: number): boolean;
};

export function createLoginAnalyticsLimiter(limit = 30, windowMs = 60_000): RateLimiter {
  const buckets = new Map<string, { n: number; at: number }>();
  return {
    allow(key, now) {
      const bucket = buckets.get(key) ?? { n: 0, at: now };
      if (now - bucket.at >= windowMs) {
        bucket.n = 0;
        bucket.at = now;
      }
      if (bucket.n >= limit) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.n += 1;
      buckets.set(key, bucket);
      return true;
    },
  };
}

export type AnalyticsCache = {
  read(now: number, threshold: number): PublicLoginAnalytics | null;
  write(now: number, threshold: number, body: PublicLoginAnalytics): void;
};

export function createAnalyticsCache(): AnalyticsCache {
  let entry: { at: number; threshold: number; body: PublicLoginAnalytics } | null = null;
  return {
    read(now, threshold) {
      if (!entry || entry.threshold !== threshold || now - entry.at >= PUBLIC_CACHE_MS) return null;
      return entry.body;
    },
    write(now, threshold, body) {
      entry = { at: now, threshold, body };
    },
  };
}

export function clientIp(request: { headers: { get(name: string): string | null } }) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function loginFrameClass(failed: boolean) {
  return failed
    ? "grid min-h-0 place-items-center bg-canvas px-6 min-[701px]:min-h-screen"
    : "grid min-h-0 bg-canvas min-[701px]:min-h-screen min-[701px]:grid-cols-[440px_1fr]";
}

export type LoginTab = "client" | "team";

/** Arrow keys move between Client and Team. Home and End jump to the ends. */
export function nextLoginTab(current: LoginTab, key: string): LoginTab | null {
  if (key === "Home") return "client";
  if (key === "End") return "team";
  if (key === "ArrowRight" || key === "ArrowDown") return current === "client" ? "team" : "client";
  if (key === "ArrowLeft" || key === "ArrowUp") return current === "team" ? "client" : "team";
  return null;
}

export type PublicAnalyticsResult = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

export async function handlePublicLoginAnalytics(input: {
  env: Env;
  now: number;
  ip: string;
  limiter: RateLimiter;
  cache: AnalyticsCache;
  load: (now: Date) => Promise<LoginContribution[]>;
  zoneISO: (asOf: Date) => string;
}): Promise<PublicAnalyticsResult> {
  if (!loginAnalyticsEnabled(input.env)) {
    return { status: 404, body: { error: "Not found" }, headers: { "Cache-Control": "no-store" } };
  }
  if (!input.limiter.allow(input.ip || "unknown", input.now)) {
    return { status: 429, body: { error: "Too many requests" }, headers: { "Cache-Control": "no-store" } };
  }
  const threshold = loginAnalyticsMinClients(input.env);
  const cached = input.cache.read(input.now, threshold);
  if (cached) {
    assertPublicAnalytics(cached);
    return { status: 200, body: cached, headers: { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" } };
  }
  try {
    const now = new Date(input.now);
    const contributions = await input.load(now);
    const names = contributions.flatMap((row) => [row.workspaceId, row.name || ""]);
    const body = buildPublicLoginAnalytics({
      contributions,
      now,
      threshold,
      zoneISO: input.zoneISO(publicAsOf(now)),
    });
    assertPublicAnalytics(body, names);
    input.cache.write(input.now, threshold, body);
    return { status: 200, body, headers: { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" } };
  } catch {
    return { status: 503, body: { error: "Unavailable" }, headers: { "Cache-Control": "no-store" } };
  }
}

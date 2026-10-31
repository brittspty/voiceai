import type { MarketingAccess } from "./marketing/access";
import { median } from "./marketing/speed-to-lead";
import { appHomePath, type Env } from "./public-routing";

/** Staff portfolio. Budget rows stay recommendations. Auto-pause is never executed from this view. */
export const PORTFOLIO_BUDGET_NOTE = "Budget changes are recommendations only; staff approve in each client's Command Center.";
export const PORTFOLIO_REFRESH_MS = 60_000;

export type PortfolioKind = MarketingAccess["kind"];

export function portfolioAllowed(kind: PortfolioKind) {
  return kind === "super_admin" || kind === "account_manager";
}

export function portfolioWorkspaceIds(input: {
  kind: PortfolioKind;
  knownIds: readonly string[];
  assignedIds: readonly string[];
}) {
  const known = [...new Set(input.knownIds.map((id) => id.trim()).filter(Boolean))];
  if (input.kind === "super_admin") return known;
  if (input.kind !== "account_manager") return [];
  const allowed = new Set(known);
  const assigned = [...new Set(input.assignedIds.map((id) => id.trim()).filter((id) => allowed.has(id)))];
  return assigned.length ? assigned : known;
}

export type CallOutcomeCounts = {
  answered: number;
  booked: number;
  noAnswer: number;
  voicemail: number;
  other: number;
};

export type PortfolioFacts = {
  id: string;
  name: string;
  channels: number;
  leads: number;
  conversions: number;
  qualityScores: number[];
  crmOutcome: boolean;
  scale: number;
  learning: number;
  cut: number;
  alerts: number;
  pixelCheckedAt: string | null;
  pixelsMissing: boolean;
  matchMatched: number;
  matchTotal: number;
  speedSeconds: number[];
  callOutcomes: CallOutcomeCounts;
  spend?: number;
};

export type PixelTone = "ok" | "warn" | "bad" | "muted";

export type PortfolioClient = {
  id: string;
  name: string;
  href: string;
  channels: number;
  leads: number;
  conversions: number;
  quality: number | null;
  provisional: boolean;
  scale: number;
  learning: number;
  cut: number;
  alerts: number;
  alertLabel: string;
  pixelLabel: string;
  pixelTone: PixelTone;
  matchRate: number | null;
  matchLabel: string;
  matchOnHold: boolean;
  speedToLeadSeconds: number | null;
  callOutcomes: CallOutcomeCounts;
  detail: string;
  spend?: number;
};

export type PortfolioModel = {
  showMoney: boolean;
  budgetWrites: false;
  autoPause: "dry_run";
  budgetNote: string;
  generatedAt: string;
  roleLine: string;
  clients: PortfolioClient[];
  totals: {
    clients: number;
    leads: number;
    qualityMedian: number | null;
    openAlerts: number;
    spend?: number;
  };
};

export function pixelHealth(checkedAt: string | null, now: Date, pixelsMissing: boolean): { label: string; tone: PixelTone } {
  if (!checkedAt) return { label: "—", tone: "muted" };
  const hours = Math.floor((now.getTime() - Date.parse(checkedAt)) / 3_600_000);
  if (!Number.isFinite(hours)) return { label: "—", tone: "muted" };
  if (pixelsMissing) return { label: hours >= 1 ? `Missing ${hours}h` : "Missing", tone: "bad" };
  if (hours >= 6) return { label: `Stale ${hours}h`, tone: "warn" };
  return { label: "OK", tone: "ok" };
}

export function matchPresentation(matched: number, total: number) {
  if (total <= 0) return { rate: null as number | null, label: "—", onHold: false };
  const rate = Math.round((matched / total) * 100);
  if (rate < 30) return { rate, label: `${rate}% · On hold: low match rate`, onHold: true };
  return { rate, label: `${rate}%`, onHold: false };
}

export function formatPortfolioSpend(amount: number) {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(safe) >= 1000) {
    const thousands = safe / 1000;
    const text = Math.abs(thousands) >= 100 ? String(Math.round(thousands)) : String(Math.round(thousands * 10) / 10);
    return `$${text}k`;
  }
  return `$${Math.round(safe).toLocaleString("en-US")}`;
}

export function commandCenterHref(workspaceId: string, env: Env = process.env) {
  if (!/^[A-Za-z0-9_-]+$/.test(workspaceId)) return appHomePath(env);
  return `${appHomePath(env)}?client=${encodeURIComponent(workspaceId)}`;
}

function alertLabel(alerts: number, pixelTone: PixelTone, matchOnHold: boolean) {
  if (alerts <= 0) return "None";
  if (pixelTone === "warn" || pixelTone === "bad") return `${alerts} · pixel stale`;
  if (matchOnHold) return `${alerts} · low match`;
  return String(alerts);
}

function outcomeDetail(outcomes: CallOutcomeCounts, conversions: number, speed: number | null) {
  const parts: string[] = [];
  if (speed != null) parts.push(`Speed ${speed}s`);
  if (conversions > 0) parts.push(`${conversions} conversions`);
  if (outcomes.answered > 0) parts.push(`${outcomes.answered} answered`);
  if (outcomes.booked > 0) parts.push(`${outcomes.booked} booked`);
  if (outcomes.noAnswer > 0) parts.push(`${outcomes.noAnswer} no answer`);
  if (outcomes.voicemail > 0) parts.push(`${outcomes.voicemail} voicemail`);
  return parts.join(" · ");
}

export function assemblePortfolio(input: {
  facts: PortfolioFacts[];
  allowedIds: readonly string[];
  showMoney: boolean;
  now?: Date;
  env?: Env;
}): PortfolioModel {
  const now = input.now ?? new Date();
  const allowed = new Set(input.allowedIds);
  const showMoney = input.showMoney;
  const clients = input.facts
    .filter((row) => allowed.has(row.id))
    .map((row) => {
      const quality = median(row.qualityScores);
      const pixel = pixelHealth(row.pixelCheckedAt, now, row.pixelsMissing);
      const match = matchPresentation(row.matchMatched, row.matchTotal);
      const speed = median(row.speedSeconds);
      const client: PortfolioClient = {
        id: row.id,
        name: row.name,
        href: commandCenterHref(row.id, input.env),
        channels: row.channels,
        leads: row.leads,
        conversions: row.conversions,
        quality,
        provisional: quality != null && !row.crmOutcome,
        scale: row.scale,
        learning: row.learning,
        cut: row.cut,
        alerts: row.alerts,
        alertLabel: alertLabel(row.alerts, pixel.tone, match.onHold),
        pixelLabel: pixel.label,
        pixelTone: pixel.tone,
        matchRate: match.rate,
        matchLabel: match.label,
        matchOnHold: match.onHold,
        speedToLeadSeconds: speed,
        callOutcomes: row.callOutcomes,
        detail: outcomeDetail(row.callOutcomes, row.conversions, speed),
      };
      if (showMoney) client.spend = row.spend ?? 0;
      return client;
    });
  const ordered = defaultPortfolioOrder(clients);
  const qualities = ordered.map((client) => client.quality).filter((value): value is number => value != null);
  const totals = {
    clients: ordered.length,
    leads: ordered.reduce((sum, client) => sum + client.leads, 0),
    qualityMedian: median(qualities),
    openAlerts: ordered.reduce((sum, client) => sum + client.alerts, 0),
    ...(showMoney ? { spend: ordered.reduce((sum, client) => sum + (client.spend ?? 0), 0) } : {}),
  };
  return {
    showMoney,
    budgetWrites: false,
    autoPause: "dry_run",
    budgetNote: PORTFOLIO_BUDGET_NOTE,
    generatedAt: now.toISOString(),
    roleLine: showMoney ? "Team · Staff role · Spend visible to staff" : "Team · Staff role · Spend hidden",
    clients: ordered,
    totals,
  };
}

export type PortfolioSortKey = "client" | "leads" | "quality" | "alerts" | "spend";

export function defaultPortfolioOrder(clients: PortfolioClient[]) {
  return [...clients].sort((a, b) => b.alerts - a.alerts || b.leads - a.leads || a.name.localeCompare(b.name));
}

export function sortPortfolio(clients: PortfolioClient[], key: PortfolioSortKey, direction: "asc" | "desc") {
  const copy = [...clients];
  copy.sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    const cmp = typeof left === "string" || typeof right === "string" ? String(left).localeCompare(String(right)) : left - right;
    if (cmp === 0) return a.name.localeCompare(b.name);
    return direction === "asc" ? cmp : -cmp;
  });
  return copy;
}

function sortValue(client: PortfolioClient, key: PortfolioSortKey): number | string {
  if (key === "client") return client.name;
  if (key === "leads") return client.leads;
  if (key === "quality") return client.quality ?? -1;
  if (key === "alerts") return client.alerts;
  return client.spend ?? -1;
}

export function portfolioHasSpend(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /"spend"|\$/.test(text);
}

export function actionMix(recommendations: { type: string; status: string }[], verdicts: string[] = []) {
  let scale = 0;
  let learning = 0;
  let cut = 0;
  for (const row of recommendations) {
    if (row.type === "budget_change" || row.type === "roi" || row.type === "pacing") continue;
    if (row.status === "draft") {
      learning += 1;
      continue;
    }
    if (row.status !== "verified" && row.status !== "accepted") continue;
    if (row.type === "creative_fatigue") cut += 1;
    else if (row.type === "performance" || row.type === "traffic") scale += 1;
    else learning += 1;
  }
  for (const verdict of verdicts) {
    if (verdict === "clearly_helping") scale += 1;
    else if (verdict === "too_early" || verdict === "maybe_helping") learning += 1;
    else if (verdict === "no_clear_effect") cut += 1;
  }
  return { scale, learning, cut };
}

export function pixelsMissing(pixels: unknown) {
  if (!pixels || typeof pixels !== "object") return false;
  const row = pixels as Record<string, unknown>;
  const keys = ["meta", "gtag", "gtm"];
  if (!keys.some((key) => key in row)) return false;
  return keys.every((key) => !row[key]);
}

export function emptyOutcomes(): CallOutcomeCounts {
  return { answered: 0, booked: 0, noAnswer: 0, voicemail: 0, other: 0 };
}

export function tallyOutcome(outcomes: CallOutcomeCounts, outcome: string | null, connected: boolean) {
  if (connected) outcomes.answered += 1;
  if (outcome === "booked") outcomes.booked += 1;
  else if (outcome === "no_answer") outcomes.noAnswer += 1;
  else if (outcome === "voicemail") outcomes.voicemail += 1;
  else if (connected) outcomes.other += 1;
}

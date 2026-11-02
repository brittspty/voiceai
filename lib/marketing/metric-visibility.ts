import type { DashboardModel, DashPoint, MetricKey } from "./dashboard-model";
import type { ClientShareView } from "./client-view";
import { isCostKey } from "./channels/cost-strip";
import type { ClientReport } from "./reports/types";

export type MetricGroup = "kpi" | "chart" | "column" | "channel";

export type ClientMetric = {
  id: string;
  group: MetricGroup;
  label: string;
  hint: string;
  /** On so the current client view stays the default. */
  defaultOn: boolean;
};

export type VisibilityMap = Record<string, boolean>;

export type MetricPresetName = "lead_gen" | "awareness" | "default";

/**
 * What a client, client viewer, share link, plan page, or export may show.
 * Spend, budget, bid, CPM/CPC/CPA/CPL and every CPx, ROAS, margin, and internal cost are absent on purpose.
 */
export const CLIENT_METRICS: readonly ClientMetric[] = [
  { id: "kpi.views", group: "kpi", label: "Views", hint: "Ad views on the dashboard, share link, and plan.", defaultOn: true },
  { id: "kpi.reach", group: "kpi", label: "People reached", hint: "How many people saw the ads. Shown for awareness campaigns.", defaultOn: true },
  { id: "kpi.clicks", group: "kpi", label: "Clicks", hint: "Clicks on the dashboard and the plan.", defaultOn: true },
  { id: "kpi.click_rate", group: "kpi", label: "Click rate", hint: "Clicks divided by views.", defaultOn: true },
  { id: "kpi.leads", group: "kpi", label: "Leads", hint: "New leads on the dashboard, share link, and plan.", defaultOn: true },
  { id: "kpi.calls", group: "kpi", label: "Calls and bookings", hint: "Booked calls and appointments.", defaultOn: true },
  { id: "kpi.qualified", group: "kpi", label: "Qualified leads", hint: "Leads that look like a fit.", defaultOn: true },
  { id: "kpi.qualified_rate", group: "kpi", label: "Qualified rate", hint: "Qualified leads out of everyone who reached you.", defaultOn: true },
  { id: "kpi.speed", group: "kpi", label: "Called within 5 min", hint: "How fast new leads heard from you.", defaultOn: true },
  { id: "chart.trend", group: "chart", label: "Trend", hint: "Results over time.", defaultOn: true },
  { id: "chart.compare", group: "chart", label: "Campaign comparison", hint: "Leads and calls by campaign.", defaultOn: true },
  { id: "chart.sources", group: "chart", label: "Where results come from", hint: "Top campaigns.", defaultOn: true },
  { id: "chart.funnel", group: "chart", label: "Funnel", hint: "Views, clicks, and results.", defaultOn: true },
  { id: "chart.audiences", group: "chart", label: "Audiences", hint: "Clicks and results by audience.", defaultOn: true },
  { id: "chart.notes", group: "chart", label: "What we're seeing", hint: "Notes from the Specificity team.", defaultOn: true },
  { id: "column.status", group: "column", label: "Status", hint: "Active or paused.", defaultOn: true },
  { id: "column.views", group: "column", label: "Views column", hint: "Views in the campaign table.", defaultOn: true },
  { id: "column.clicks", group: "column", label: "Clicks column", hint: "Clicks in the campaign table.", defaultOn: true },
  { id: "column.click_rate", group: "column", label: "Click rate column", hint: "Click rate in the campaign table.", defaultOn: true },
  { id: "column.results", group: "column", label: "Leads and calls column", hint: "Leads and calls in the campaign table.", defaultOn: true },
  { id: "column.reach", group: "column", label: "People reached column", hint: "Reach inside awareness rows.", defaultOn: true },
  { id: "channel.meta", group: "channel", label: "Meta", hint: "Facebook and Instagram.", defaultOn: true },
  { id: "channel.google", group: "channel", label: "Google", hint: "Search ads, Maps, and the Business Profile.", defaultOn: true },
  { id: "channel.tiktok", group: "channel", label: "TikTok", hint: "TikTok ads.", defaultOn: true },
  { id: "channel.video", group: "channel", label: "Video", hint: "YouTube and other video.", defaultOn: true },
  { id: "channel.ctv", group: "channel", label: "Connected TV", hint: "Connected TV and StackAdapt.", defaultOn: true },
  { id: "channel.programmatic", group: "channel", label: "Programmatic", hint: "Programmatic display.", defaultOn: true },
  { id: "channel.other", group: "channel", label: "Other channels", hint: "Landing pages, voice, and anything else.", defaultOn: true },
];

const CLIENT_METRIC_IDS = new Set(CLIENT_METRICS.map((metric) => metric.id));

const COST_ID = /spend|budget|bid|roas|margin|revenue|micros|cost|pacing|cp[a-z0-9]/i;

/** True for spend, budget, bid, every CPx, ROAS, margin, and internal cost. Clicks and click rate are not cost. */
export function isForbiddenMetricId(id: string) {
  const token = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!token) return false;
  const stripped = token.replace(/clickrate/g, "").replace(/clicks/g, "").replace(/click/g, "");
  return COST_ID.test(stripped);
}

export function defaultVisibility(): VisibilityMap {
  const map: VisibilityMap = {};
  for (const metric of CLIENT_METRICS) map[metric.id] = metric.defaultOn;
  return map;
}

export function leadGenPreset(): VisibilityMap {
  const next = defaultVisibility();
  next["kpi.views"] = false;
  next["kpi.reach"] = false;
  next["column.views"] = false;
  next["column.reach"] = false;
  next["chart.audiences"] = false;
  return next;
}

export function awarenessPreset(): VisibilityMap {
  const next = defaultVisibility();
  for (const id of ["kpi.leads", "kpi.calls", "kpi.qualified", "kpi.qualified_rate", "kpi.speed", "chart.compare", "chart.sources", "chart.funnel", "column.results"]) {
    next[id] = false;
  }
  return next;
}

export function presetVisibility(name: MetricPresetName): VisibilityMap {
  if (name === "lead_gen") return leadGenPreset();
  if (name === "awareness") return awarenessPreset();
  return defaultVisibility();
}

/** Stored JSON is merged onto the defaults. Unknown keys are ignored. Cost keys are dropped. */
export function resolveVisibility(stored: unknown): VisibilityMap {
  const next = defaultVisibility();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return next;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (isForbiddenMetricId(key) || !CLIENT_METRIC_IDS.has(key)) continue;
    if (typeof value === "boolean") next[key] = value;
  }
  return next;
}

export function visibilityChanges(before: VisibilityMap, after: VisibilityMap) {
  const changes: { metricId: string; oldValue: boolean; newValue: boolean }[] = [];
  for (const metric of CLIENT_METRICS) {
    const oldValue = before[metric.id] !== false;
    const newValue = after[metric.id] !== false;
    if (oldValue !== newValue) changes.push({ metricId: metric.id, oldValue, newValue });
  }
  return changes;
}

export function metricShown(visibility: VisibilityMap | undefined, id: string) {
  if (isForbiddenMetricId(id)) return false;
  if (!visibility) return true;
  return visibility[id] !== false;
}

const KPI_LABELS: Record<string, string> = {
  Views: "kpi.views",
  "People reached": "kpi.reach",
  Clicks: "kpi.clicks",
  "Click rate": "kpi.click_rate",
  Leads: "kpi.leads",
  Calls: "kpi.calls",
  "Ad views": "kpi.views",
  "New leads": "kpi.leads",
  "Booked calls": "kpi.calls",
  "Booked appointments": "kpi.calls",
  "Qualified leads": "kpi.qualified",
  "Qualified rate": "kpi.qualified_rate",
  "Called within 5 min": "kpi.speed",
  "Median speed to lead": "kpi.speed",
  Impressions: "kpi.views",
  Spend: "kpi.spend",
  CPC: "kpi.cpc",
  CPM: "kpi.cpm",
  "CPA (per lead or call)": "kpi.cpa",
  CPA: "kpi.cpa",
  CPL: "kpi.cpl",
  "Est. ROAS": "kpi.roas",
  ROAS: "kpi.roas",
};

export function kpiTileShown(visibility: VisibilityMap | undefined, label: string) {
  const id = KPI_LABELS[label];
  if (!id) return !visibility || !isForbiddenMetricId(label);
  return metricShown(visibility, id);
}

const PLATFORM_CHANNEL: Record<string, string> = {
  meta: "channel.meta",
  facebook: "channel.meta",
  instagram: "channel.meta",
  google: "channel.google",
  google_ads: "channel.google",
  googleads: "channel.google",
  gbp: "channel.google",
  tiktok: "channel.tiktok",
  youtube: "channel.video",
  video: "channel.video",
  stackadapt: "channel.ctv",
  ctv: "channel.ctv",
  programmatic: "channel.programmatic",
  display: "channel.programmatic",
};

export function channelMetricId(nameOrId: string) {
  const token = nameOrId.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  if (/meta|facebook|instagram/.test(token)) return "channel.meta";
  if (/google|gbp|search ads|maps/.test(token)) return "channel.google";
  if (/tiktok/.test(token)) return "channel.tiktok";
  if (/youtube|video/.test(token)) return "channel.video";
  if (/ctv|stackadapt|connected tv/.test(token)) return "channel.ctv";
  if (/programmatic|display/.test(token)) return "channel.programmatic";
  const compact = token.replace(/ /g, "");
  return PLATFORM_CHANNEL[compact] || "channel.other";
}

export function channelShown(visibility: VisibilityMap | undefined, nameOrId: string) {
  return metricShown(visibility, channelMetricId(nameOrId));
}

export function trendChoices(visibility: VisibilityMap | undefined, showMoney: boolean): MetricKey[] {
  const keys: MetricKey[] = ["i", "r", "c", "l", "k"];
  if (showMoney && !visibility) keys.push("s");
  if (!visibility) return keys;
  return keys.filter((key) => {
    if (key === "i") return metricShown(visibility, "kpi.views") || metricShown(visibility, "column.views");
    if (key === "r") return metricShown(visibility, "kpi.reach") || metricShown(visibility, "column.reach");
    if (key === "c") return metricShown(visibility, "kpi.clicks") || metricShown(visibility, "column.clicks");
    if (key === "l") return metricShown(visibility, "kpi.leads") || metricShown(visibility, "column.results");
    if (key === "k") return metricShown(visibility, "kpi.calls") || metricShown(visibility, "column.results");
    return false;
  });
}

function keepSeries(visibility: VisibilityMap) {
  const on = (id: string) => visibility[id] !== false;
  const trend = on("chart.trend");
  return {
    i: on("kpi.views") || on("column.views") || on("chart.funnel") || on("kpi.click_rate") || on("column.click_rate") || (trend && (on("kpi.views") || on("column.views"))),
    r: on("kpi.reach") || on("column.reach") || on("chart.audiences") || (trend && on("kpi.reach")),
    c: on("kpi.clicks") || on("column.clicks") || on("kpi.click_rate") || on("column.click_rate") || on("chart.funnel") || on("chart.audiences") || (trend && (on("kpi.clicks") || on("kpi.click_rate"))),
    l: on("kpi.leads") || on("column.results") || on("chart.compare") || on("chart.sources") || on("chart.funnel") || (trend && on("kpi.leads")),
    k: on("kpi.calls") || on("column.results") || on("chart.compare") || on("chart.sources") || on("chart.funnel") || (trend && on("kpi.calls")),
  };
}

function stripDay(day: DashPoint, keep: ReturnType<typeof keepSeries>): DashPoint {
  const next: DashPoint = {
    date: day.date,
    i: keep.i ? day.i : 0,
    r: keep.r ? day.r : 0,
    c: keep.c ? day.c : 0,
    l: keep.l ? day.l : 0,
    k: keep.k ? day.k : 0,
  };
  return next;
}

export function shapeClientDashboard(model: DashboardModel, visibility: VisibilityMap): DashboardModel {
  const safe = resolveVisibility(visibility);
  const keep = keepSeries(safe);
  const campaigns = model.campaigns
    .filter((campaign) => channelShown(safe, campaign.platform))
    .map((campaign) => ({
      ...campaign,
      dailyBudget: undefined,
      budgetSetBy: undefined,
      budgetSetAt: undefined,
      ads: campaign.ads.map((ad) => ({
        ...ad,
        days: ad.days.map((day) => stripDay(day, keep)),
      })),
    }));
  const next: DashboardModel = {
    ...model,
    mode: "client",
    showMoney: false,
    canEditLeadValue: undefined,
    leadValue: undefined,
    campaigns,
    notes: safe["chart.notes"] === false ? [] : model.notes,
    metricVisibility: safe,
  };
  delete next.canEditLeadValue;
  delete next.leadValue;
  return stripCostKeys(next);
}

const SHARE_KPI: Record<string, string> = {
  "Booked calls": "kpi.calls",
  "New leads": "kpi.leads",
  "Called within 5 min": "kpi.speed",
  "Ad views": "kpi.views",
  "Qualified leads": "kpi.qualified",
  "Qualified rate": "kpi.qualified_rate",
};

function subtractCount(value: string, amount: number) {
  if (!amount) return value;
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return value;
  return Math.max(0, parsed - amount).toLocaleString("en-US");
}

export function filterShareView(view: ClientShareView, visibility: VisibilityMap): ClientShareView {
  const safe = resolveVisibility(visibility);
  const hidden = view.campaigns.filter((row) => !channelShown(safe, row.channel));
  const hiddenLeads = hidden.reduce((sum, row) => sum + row.leads, 0);
  const hiddenBooked = hidden.reduce((sum, row) => sum + row.booked, 0);
  const campaigns = view.campaigns.filter((row) => channelShown(safe, row.channel));
  const kpis = view.kpis
    .filter((kpi) => {
      const id = SHARE_KPI[kpi.label];
      if (id) return metricShown(safe, id);
      return kpiTileShown(safe, kpi.label);
    })
    .map((kpi) => {
      if (kpi.label === "New leads") return { ...kpi, value: subtractCount(kpi.value, hiddenLeads) };
      if (kpi.label === "Booked calls") return { ...kpi, value: subtractCount(kpi.value, hiddenBooked) };
      return kpi;
    });
  return stripCostKeys({ ...view, kpis, campaigns });
}

const REPORT_KPI: Record<string, string> = {
  qualified: "kpi.qualified",
  booked: "kpi.calls",
  leads: "kpi.leads",
  speed: "kpi.speed",
  views: "kpi.views",
  impressions: "kpi.views",
  clicks: "kpi.clicks",
  reach: "kpi.reach",
  ctr: "kpi.click_rate",
};

function reportPieceShown(visibility: VisibilityMap, id: string, label: string) {
  if (isForbiddenMetricId(id) || isForbiddenMetricId(label) || isCostKey(id)) return false;
  const metric = REPORT_KPI[id] || KPI_LABELS[label];
  if (!metric) return kpiTileShown(visibility, label);
  return metricShown(visibility, metric);
}

export function filterClientReport<T extends ClientReport>(report: T, visibility: VisibilityMap): T {
  const safe = resolveVisibility(visibility);
  const series = report.series
    .filter((item) => reportPieceShown(safe, item.id, item.title))
    .map((item) => ({
      ...item,
      points: item.points.map((point) => ({
        ...point,
        splits: point.splits.filter((split) => channelShown(safe, split.name)),
      })),
    }));
  const defaultSeriesId = series.some((item) => item.id === report.defaultSeriesId) ? report.defaultSeriesId : series[0]?.id || "";
  return stripCostKeys({
    ...report,
    kpis: report.kpis.filter((kpi) => reportPieceShown(safe, kpi.id, kpi.label)),
    series,
    defaultSeriesId,
    channels: report.channels.filter((row) => channelShown(safe, row.id) && channelShown(safe, row.name)),
    funnel: report.funnel.filter((step) => reportPieceShown(safe, step.id, step.label)),
  });
}

export type PlanClientStats = {
  impressions?: number;
  clicks?: number;
  leads?: number;
};

export function filterPlanNumbers(
  numbers: { impressions?: number; clicks?: number; leads?: number },
  visibility: VisibilityMap,
): PlanClientStats {
  const safe = resolveVisibility(visibility);
  const next: PlanClientStats = {};
  if (safe["kpi.views"] !== false && numbers.impressions != null) next.impressions = numbers.impressions;
  if (safe["kpi.clicks"] !== false && numbers.clicks != null) next.clicks = numbers.clicks;
  if (safe["kpi.leads"] !== false && numbers.leads != null) next.leads = numbers.leads;
  return next;
}

export function filterPlanChannels(channels: readonly string[], visibility: VisibilityMap) {
  const safe = resolveVisibility(visibility);
  return channels.filter((name) => channelShown(safe, name));
}

function isDashboard(value: Record<string, unknown>): value is DashboardModel & Record<string, unknown> {
  return value.mode === "client" && Array.isArray(value.campaigns) && Array.isArray(value.dates);
}

function isShare(value: Record<string, unknown>): value is ClientShareView & Record<string, unknown> {
  return value.viewOnly === true && Array.isArray(value.kpis) && typeof value.client === "string";
}

function isReport(value: Record<string, unknown>): value is ClientReport & Record<string, unknown> {
  return value.audience === "client" && Array.isArray(value.kpis) && Array.isArray(value.channels) && Array.isArray(value.series);
}

/** Server-side filter. When the switch is off, the payload is returned unchanged. */
export function applyClientSurface<T>(value: T, visibility: VisibilityMap, enabled = true): T {
  if (!enabled || !value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (isDashboard(record)) return shapeClientDashboard(record, visibility) as T;
  if (isShare(record)) return filterShareView(record, visibility) as T;
  if (isReport(record)) return filterClientReport(record, visibility) as T;
  if (typeof record.impressions === "number" && typeof record.clicks === "number" && typeof record.leads === "number" && !Array.isArray(record.campaigns)) {
    return filterPlanNumbers(record as { impressions: number; clicks: number; leads: number }, visibility) as T;
  }
  if ("ctv" in record && !metricShown(resolveVisibility(visibility), "channel.ctv")) {
    const rest = { ...record };
    delete rest.ctv;
    return stripCostKeys(rest) as T;
  }
  return stripCostKeys(record) as T;
}

const COST_TEXT = /\$|\b(spend|budgets?|cpc|cpm|cpa|cpl|cpql|cpx|roas|revenue|costs?|bids?|margins?)\b/i;

function stripCostKeys<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return COST_TEXT.test(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(walk).filter((item) => item !== undefined);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isCostKey(key) || isForbiddenMetricId(key)) continue;
    if (key === "showMoney" || key === "showCost") {
      next[key] = false;
      continue;
    }
    const cleaned = walk(child);
    if (cleaned === undefined) continue;
    next[key] = cleaned;
  }
  return next;
}

export type MetricWriteInput = {
  metrics?: unknown;
  preset?: unknown;
  reset?: unknown;
};

export function parseMetricWrite(
  current: VisibilityMap,
  input: MetricWriteInput,
): { ok: true; next: VisibilityMap } | { ok: false; error: string } {
  if (input.reset === true) return { ok: true, next: defaultVisibility() };
  if (input.preset === "lead_gen" || input.preset === "awareness" || input.preset === "default") {
    return { ok: true, next: presetVisibility(input.preset) };
  }
  if (input.preset != null && input.preset !== "") return { ok: false, error: "Unknown preset." };
  if (!input.metrics || typeof input.metrics !== "object" || Array.isArray(input.metrics)) {
    return { ok: false, error: "Choose a metric or a preset." };
  }
  const entries = Object.entries(input.metrics as Record<string, unknown>);
  if (entries.some(([key]) => isForbiddenMetricId(key))) {
    return { ok: false, error: "Cost metrics stay off for clients." };
  }
  const next = { ...current };
  for (const [key, value] of entries) {
    if (!CLIENT_METRIC_IDS.has(key)) continue;
    if (typeof value !== "boolean") return { ok: false, error: "Each metric is on or off." };
    next[key] = value;
  }
  return { ok: true, next };
}

export function catalogView(visibility: VisibilityMap) {
  const safe = resolveVisibility(visibility);
  return CLIENT_METRICS.map((metric) => ({
    id: metric.id,
    group: metric.group,
    label: metric.label,
    hint: metric.hint,
    on: safe[metric.id] !== false,
  }));
}

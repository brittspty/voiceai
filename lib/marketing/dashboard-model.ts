import { forbiddenClientKeys } from "./client-view";
import { googleAdsEnabled, type Env } from "./config";
import { estimatedRoas, formatCents } from "./lead-value";
import { isolatedWhere } from "./workspace";

export type DashGoal = "leads" | "calls" | "awareness";
export type DashStatus = "active" | "paused" | "other";
export type MetricKey = "i" | "r" | "c" | "l" | "k" | "s";
export type DashPlatform = "meta" | "google_ads";

export const METRIC_NAMES: Record<MetricKey, string> = {
  i: "Views",
  r: "People reached",
  c: "Clicks",
  l: "Leads",
  k: "Calls",
  s: "Spend",
};

export const PACING_LIMIT = 1.25;

export type DashPoint = {
  date: string;
  i: number;
  r: number;
  c: number;
  l: number;
  k: number;
  s?: number;
};

export type DashAd = {
  id: string;
  name: string;
  format: string;
  status: DashStatus;
  audience: string;
  thumbnailUrl: string | null;
  days: DashPoint[];
};

export type DashCampaign = {
  id: string;
  name: string;
  goal: DashGoal;
  status: DashStatus;
  platform: DashPlatform;
  ads: DashAd[];
  dailyBudget?: number | null;
  budgetSetBy?: string | null;
  budgetSetAt?: string | null;
};

export type DashNote = { campaignId: string; campaignName: string; text: string };

export type LeadValueCard = {
  leadCents: number;
  callCents: number | null;
  by: string;
  at: string;
};

export type DashboardModel = {
  mode: "staff" | "client";
  showMoney: boolean;
  canEditLeadValue?: boolean;
  dates: string[];
  campaigns: DashCampaign[];
  notes: DashNote[];
  leadValue?: LeadValueCard | null;
  sourceLine: string;
  workspaceName: string;
  mock: boolean;
};

export type DashQuery = {
  days: 7 | 14 | 30;
  status: "" | "active" | "paused";
  goal: "" | DashGoal;
  metric: MetricKey;
  campaignId: string | null;
  editLead: boolean;
};

export function dashboardPlatforms(env: Env = process.env): DashPlatform[] {
  return googleAdsEnabled(env) ? ["meta", "google_ads"] : ["meta"];
}

export function dashboardCampaignWhere(input: {
  workspaceId: string;
  platforms: DashPlatform[];
  adAccountIds?: "all" | string[];
  campaignIds?: "all" | string[];
}) {
  if (!input.platforms.length) throw new Error("A platform is required.");
  const extra: {
    platform: { in: DashPlatform[] };
    status: { notIn: ("archived" | "deleted")[] };
    id?: { in: string[] };
    adAccountId?: { in: string[] };
  } = {
    platform: { in: input.platforms },
    status: { notIn: ["archived", "deleted"] },
  };
  if (input.campaignIds && input.campaignIds !== "all") extra.id = { in: input.campaignIds };
  else if (input.adAccountIds && input.adAccountIds !== "all") extra.adAccountId = { in: input.adAccountIds };
  return isolatedWhere(input.workspaceId, extra);
}

export function dashboardMetricWhere(input: {
  workspaceId: string;
  platforms: DashPlatform[];
  campaignIds: string[];
  start: string;
  end: string;
}) {
  return isolatedWhere(input.workspaceId, {
    platform: { in: input.platforms },
    campaignId: { in: input.campaignIds },
    date: { gte: new Date(`${input.start}T00:00:00.000Z`), lte: new Date(`${input.end}T00:00:00.000Z`) },
    audienceSegment: { segmentKey: "all" },
  });
}

export function parseDashQuery(input: Record<string, string | string[] | undefined>): DashQuery {
  const one = (key: string) => {
    const value = input[key];
    return Array.isArray(value) ? value[0] || "" : value || "";
  };
  const daysRaw = one("d");
  const days: 7 | 14 | 30 = daysRaw === "7" || daysRaw === "14" ? (Number(daysRaw) as 7 | 14) : 30;
  const statusRaw = one("st");
  const status = statusRaw === "active" || statusRaw === "paused" ? statusRaw : "";
  const goalRaw = one("g");
  const goal = goalRaw === "leads" || goalRaw === "calls" || goalRaw === "awareness" ? goalRaw : "";
  const metricRaw = one("m");
  const metric = (["i", "r", "c", "l", "k", "s"] as const).find((key) => key === metricRaw) || "l";
  const camp = one("camp");
  return { days, status, goal, metric, campaignId: camp || null, editLead: one("edit") === "lv" };
}

export function dashSearch(query: DashQuery, patch: Partial<DashQuery> = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.campaignId) params.set("camp", next.campaignId);
  if (next.days !== 30) params.set("d", String(next.days));
  if (next.status) params.set("st", next.status);
  if (next.goal) params.set("g", next.goal);
  if (next.metric !== "l") params.set("m", next.metric);
  if (next.editLead) params.set("edit", "lv");
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function dashboardGoal(objective: string): DashGoal {
  if (objective === "awareness") return "awareness";
  if (objective === "calls") return "calls";
  return "leads";
}

export function dashboardStatus(status: string): DashStatus {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  return "other";
}

export function formatLabel(format: string) {
  const labels: Record<string, string> = {
    image: "Image",
    video: "Video",
    carousel: "Carousel",
    text: "Text",
    lead_form: "Lead form",
    unknown: "Ad",
  };
  return labels[format] || "Ad";
}

/** Client wording for audience names. Staff keep the names synced from the ad platform. */
export function audienceLabel(name: string, client: boolean) {
  const trimmed = name.trim();
  if (!client || !trimmed) return trimmed;
  if (/lookalike/i.test(trimmed)) return "People similar to your customers";
  const broad = trimmed.match(/broad\s+(\d+)\s*-\s*(\d+)/i);
  if (broad) return `Ages ${broad[1]}-${broad[2]}`;
  if (/^broad$/i.test(trimmed)) return "A wide audience";
  if (/retarget/i.test(trimmed)) return "People who visited your site";
  return trimmed;
}

export function resultCounts(objective: string, platformLeads: number, platformConversions: number) {
  if (objective === "awareness") return { leads: 0, calls: 0 };
  if (objective === "calls") {
    if (platformConversions > 0) return { leads: platformLeads, calls: platformConversions };
    return { leads: 0, calls: platformLeads };
  }
  return { leads: platformLeads, calls: 0 };
}

export type RawMetric = {
  date: string;
  adId: string;
  campaignId: string;
  attributionWindow: string;
  impressions: number;
  clicks: number;
  reach: number;
  platformLeads: number;
  platformConversions: number;
  spend?: number;
};

export function pickAttributionWindow(rows: { attributionWindow: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.attributionWindow, (counts.get(row.attributionWindow) ?? 0) + 1);
  let best = "";
  let n = -1;
  for (const [window, count] of counts) {
    if (count > n || (count === n && window > best)) {
      best = window;
      n = count;
    }
  }
  return best;
}

export function collapseMetrics(rows: RawMetric[]) {
  const window = pickAttributionWindow(rows);
  const kept = window ? rows.filter((row) => row.attributionWindow === window) : rows;
  const byKey = new Map<string, RawMetric>();
  for (const row of kept) {
    const key = `${row.campaignId}|${row.adId}|${row.date}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      continue;
    }
    prev.impressions += row.impressions;
    prev.clicks += row.clicks;
    prev.reach += row.reach;
    prev.platformLeads += row.platformLeads;
    prev.platformConversions += row.platformConversions;
    if (row.spend != null) prev.spend = (prev.spend ?? 0) + row.spend;
  }
  return [...byKey.values()];
}

export type RawAd = {
  id: string;
  name: string;
  status: string;
  format: string;
  audienceNames: string[];
  thumbnailUrl: string | null;
};

export type RawCampaign = {
  id: string;
  name: string;
  objective: string;
  status: string;
  platform: DashPlatform;
  dailyBudget: number | null;
  budgetSetBy: string | null;
  budgetSetAt: string | null;
  ads: RawAd[];
};

export function scrubActId(value: string) {
  return value.replace(/act_\d+/g, "").replace(/\s{2,}/g, " ").trim();
}

export function assembleCampaigns(input: {
  dates: string[];
  campaigns: RawCampaign[];
  metrics: RawMetric[];
  clientLabels: boolean;
  showMoney: boolean;
}): DashCampaign[] {
  const metrics = collapseMetrics(input.metrics);
  const byAdDate = new Map<string, RawMetric>();
  for (const row of metrics) byAdDate.set(`${row.adId}|${row.date}`, row);
  return input.campaigns.map((campaign) => {
    const ads: DashAd[] = campaign.ads.map((ad) => {
      const audienceSource = ad.audienceNames.length ? ad.audienceNames : ["Audience"];
      const audience = [...new Set(audienceSource.map((name) => audienceLabel(name, input.clientLabels)))].join(", ");
      const days = input.dates.map((date) => {
        const row = byAdDate.get(`${ad.id}|${date}`);
        const counts = resultCounts(campaign.objective, row?.platformLeads ?? 0, row?.platformConversions ?? 0);
        const point: DashPoint = {
          date,
          i: row?.impressions ?? 0,
          r: row?.reach ?? 0,
          c: row?.clicks ?? 0,
          l: counts.leads,
          k: counts.calls,
        };
        if (input.showMoney) point.s = row?.spend ?? 0;
        return point;
      });
      return {
        id: ad.id,
        name: input.clientLabels ? scrubActId(ad.name) : ad.name,
        format: formatLabel(ad.format),
        status: dashboardStatus(ad.status),
        audience,
        thumbnailUrl: ad.thumbnailUrl && /^https:\/\//.test(ad.thumbnailUrl) ? ad.thumbnailUrl : null,
        days,
      };
    });
    const next: DashCampaign = {
      id: campaign.id,
      name: input.clientLabels ? scrubActId(campaign.name) : campaign.name,
      goal: dashboardGoal(campaign.objective),
      status: dashboardStatus(campaign.status),
      platform: campaign.platform,
      ads,
    };
    if (input.showMoney) {
      next.dailyBudget = campaign.dailyBudget;
      next.budgetSetBy = campaign.budgetSetBy;
      next.budgetSetAt = campaign.budgetSetAt;
    }
    return next;
  });
}

const ACT_ID = /act_\d+/;
const CLIENT_MONEY_TEXT = /spend|cost|cpc|cpm|cpa|budget|roas|revenue|\$/i;

export function projectDashboard(
  model: DashboardModel,
  opts: { mode: "staff" | "client"; showMoney: boolean; canEditLeadValue: boolean },
): DashboardModel {
  const showMoney = opts.mode === "staff" && opts.showMoney;
  const client = opts.mode === "client";
  const canEditLeadValue = !client && opts.canEditLeadValue;
  const notes = model.notes
    .filter((note) => (showMoney ? true : !CLIENT_MONEY_TEXT.test(note.text)))
    .map((note) => ({
      ...note,
      campaignName: client ? scrubActId(note.campaignName) : note.campaignName,
      text: client ? scrubActId(note.text) : note.text,
    }));
  const next: DashboardModel = {
    mode: opts.mode,
    showMoney,
    ...(canEditLeadValue ? { canEditLeadValue: true } : {}),
    dates: model.dates,
    campaigns: model.campaigns.map((campaign) => {
      const row: DashCampaign = {
        ...campaign,
        name: client ? scrubActId(campaign.name) : campaign.name,
        ads: campaign.ads.map((ad) => ({
          ...ad,
          name: client ? scrubActId(ad.name) : ad.name,
          days: ad.days.map((day) => {
            if (showMoney) return day;
            const rest = { ...day };
            delete rest.s;
            return rest;
          }),
        })),
      };
      if (!showMoney) {
        delete row.dailyBudget;
        delete row.budgetSetBy;
        delete row.budgetSetAt;
      }
      return row;
    }),
    notes,
    sourceLine: client ? model.sourceLine.replace(/ · account\b.*/i, "").replace(ACT_ID, "") : model.sourceLine,
    workspaceName: model.workspaceName,
    mock: model.mock,
  };
  if (showMoney) next.leadValue = model.leadValue ?? null;
  if (client) assertClientSafe(next);
  return next;
}

export function assertClientSafe(value: unknown) {
  const keys = forbiddenClientKeys(value);
  if (keys.length) throw new Error(`Client dashboard included ${keys.join(", ")}.`);
  const json = JSON.stringify(value);
  if (ACT_ID.test(json)) throw new Error("Client dashboard included an ad account id.");
  if (/"s"\s*:/.test(json)) throw new Error("Client dashboard included spend.");
}

export function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

export function formatMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

export function formatPct(x: number) {
  return `${(x * 100).toFixed(2)}%`;
}

export function oneIn(part: number, whole: number) {
  if (!(part > 0) || !(whole > 0)) return "none";
  return `1 in ${Math.round(whole / part)}`;
}

export function statusLabel(status: DashStatus) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  return "Other";
}

export function goalLabel(goal: DashGoal) {
  if (goal === "calls") return "Calls";
  if (goal === "awareness") return "Awareness";
  return "Leads";
}

function sliceBounds(length: number, days: number) {
  const end = length;
  const start = Math.max(0, end - days);
  const prevEnd = start;
  const prevStart = Math.max(0, prevEnd - days);
  const hasPrev = prevEnd - prevStart === days && start - prevStart > 0 && prevEnd > prevStart;
  return { start, end, prevStart, prevEnd, hasPrev: hasPrev && prevEnd === start };
}

function dayCount(campaigns: DashCampaign[]) {
  let count = 0;
  for (const campaign of campaigns) {
    for (const ad of campaign.ads) count = Math.max(count, ad.days.length);
  }
  return count;
}

export function series(campaigns: DashCampaign[], key: MetricKey) {
  if (!campaigns.length) return [];
  const length = dayCount(campaigns);
  const totals = Array(length).fill(0);
  for (const campaign of campaigns) {
    for (const ad of campaign.ads) {
      ad.days.forEach((day, index) => {
        const value = key === "s" ? day.s ?? 0 : day[key];
        totals[index] += value;
      });
    }
  }
  return totals;
}

export function rangeTotal(values: number[], start: number, end: number) {
  return values.slice(start, end).reduce((sum, value) => sum + value, 0);
}

export function goalsPresent(campaigns: DashCampaign[]) {
  return {
    leads: campaigns.some((campaign) => campaign.goal === "leads"),
    calls: campaigns.some((campaign) => campaign.goal === "calls"),
    awareness: campaigns.some((campaign) => campaign.goal === "awareness"),
  };
}

export type KpiTile = {
  label: string;
  value: string;
  hint: string;
  change: number | null;
  good: boolean | null;
  series: number[] | null;
  prompt: boolean;
};

function changeOf(current: number, previous: number | null) {
  if (previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

export function buildKpis(input: {
  campaigns: DashCampaign[];
  days: number;
  showMoney: boolean;
  leadValue: LeadValueCard | null;
}): KpiTile[] {
  const length = dayCount(input.campaigns);
  const bounds = sliceBounds(length, input.days);
  const totals = (key: MetricKey, start: number, end: number) => rangeTotal(series(input.campaigns, key), start, end);
  const goals = goalsPresent(input.campaigns);
  const results = (start: number, end: number) => totals("l", start, end) + totals("k", start, end);
  const defs: { label: string; value: (start: number, end: number) => number; format: "count" | "pct" | "money" | "x"; spark: MetricKey | null; inverse?: boolean; prompt?: boolean; hint?: string }[] = [];
  defs.push({ label: "Views", value: (start, end) => totals("i", start, end), format: "count", spark: "i" });
  if (goals.awareness && !goals.leads && !goals.calls) {
    defs.push({ label: "People reached", value: (start, end) => totals("r", start, end), format: "count", spark: "r" });
  }
  defs.push(
    { label: "Clicks", value: (start, end) => totals("c", start, end), format: "count", spark: "c" },
    {
      label: "Click rate",
      value: (start, end) => totals("c", start, end) / Math.max(1, totals("i", start, end)),
      format: "pct",
      spark: null,
    },
  );
  if (goals.leads) defs.push({ label: "Leads", value: (start, end) => totals("l", start, end), format: "count", spark: "l" });
  if (goals.calls) defs.push({ label: "Calls", value: (start, end) => totals("k", start, end), format: "count", spark: "k" });
  if (input.showMoney) {
    defs.push(
      { label: "Spend", value: (start, end) => totals("s", start, end), format: "money", spark: "s", inverse: true },
      {
        label: "CPC",
        value: (start, end) => totals("s", start, end) / Math.max(1, totals("c", start, end)),
        format: "money",
        spark: null,
        inverse: true,
      },
      {
        label: "CPM",
        value: (start, end) => (totals("s", start, end) / Math.max(1, totals("i", start, end))) * 1000,
        format: "money",
        spark: null,
        inverse: true,
      },
    );
    if (goals.leads || goals.calls) {
      defs.push({
        label: "CPA (per lead or call)",
        value: (start, end) => totals("s", start, end) / Math.max(1, results(start, end)),
        format: "money",
        spark: null,
        inverse: true,
      });
      if (input.leadValue) {
        const hint =
          input.leadValue.callCents == null
            ? `at ${formatCents(input.leadValue.leadCents)} per lead`
            : `at ${formatCents(input.leadValue.leadCents)} per lead · ${formatCents(input.leadValue.callCents)} per call`;
        defs.push({
          label: "Est. ROAS",
          hint,
          value: (start, end) =>
            estimatedRoas({
              leads: totals("l", start, end),
              calls: totals("k", start, end),
              spend: totals("s", start, end),
              leadCents: input.leadValue?.leadCents ?? null,
              callCents: input.leadValue?.callCents ?? null,
            }) ?? Number.NaN,
          format: "x",
          spark: null,
        });
      } else {
        defs.push({ label: "Est. ROAS", value: () => 0, format: "x", spark: null, prompt: true });
      }
    }
  }
  return defs.map((def) => {
    if (def.prompt) {
      return { label: def.label, value: "", hint: "", change: null, good: null, series: null, prompt: true };
    }
    const current = def.value(bounds.start, bounds.end);
    const previous = bounds.hasPrev ? def.value(bounds.prevStart, bounds.prevEnd) : null;
    const change = previous == null || !Number.isFinite(current) || !Number.isFinite(previous) ? null : changeOf(current, previous);
    const value = Number.isNaN(current)
      ? "—"
      : def.format === "pct"
        ? formatPct(current)
        : def.format === "money"
          ? formatMoney(current)
          : def.format === "x"
            ? `${current.toFixed(2)}x`
            : formatCount(current);
    const spark = def.spark ? series(input.campaigns, def.spark).slice(bounds.start, bounds.end) : null;
    return {
      label: def.label,
      value,
      hint: def.hint || "",
      change,
      good: change == null ? null : def.inverse ? change < 0 : change > 0,
      series: spark,
      prompt: false,
    };
  });
}

export function anomalies(values: number[]) {
  const found: { index: number; change: number }[] = [];
  for (let index = 7; index < values.length; index += 1) {
    const window = values.slice(index - 7, index);
    const mean = window.reduce((sum, value) => sum + value, 0) / 7;
    const sd = Math.sqrt(window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 7);
    if (sd > 0 && Math.abs(values[index] - mean) > 2.5 * sd && mean > 3) {
      found.push({ index, change: (values[index] - mean) / mean });
    }
  }
  return found;
}

export function anomalyReason(metricName: string, change: number) {
  return `${metricName} ${Math.abs(change * 100).toFixed(0)}% ${change > 0 ? "above" : "below"} normal`;
}

export function spendOverPacing(spend: number, dailyBudget: number) {
  return dailyBudget > 0 && spend > dailyBudget * PACING_LIMIT;
}

export function effectiveMetric(input: { metric: MetricKey; goal: DashGoal | null; showMoney: boolean }): MetricKey {
  let metric = input.metric;
  if (!input.showMoney && metric === "s") metric = "l";
  if (!input.goal) return metric;
  if (metric === "i" || metric === "c" || metric === "r" || metric === "s") return metric;
  if (input.goal === "awareness") return "r";
  if (input.goal === "calls") return "k";
  if (input.goal === "leads") return "l";
  return metric;
}

export type CampaignRollup = {
  campaign: DashCampaign;
  views: number;
  clicks: number;
  reach: number;
  results: number;
  ctr: number;
  spend: number;
};

export function rollupCampaigns(campaigns: DashCampaign[], days: number): CampaignRollup[] {
  const length = dayCount(campaigns);
  const bounds = sliceBounds(length, days);
  return campaigns.map((campaign) => {
    const views = rangeTotal(series([campaign], "i"), bounds.start, bounds.end);
    const clicks = rangeTotal(series([campaign], "c"), bounds.start, bounds.end);
    const reach = rangeTotal(series([campaign], "r"), bounds.start, bounds.end);
    const results = rangeTotal(series([campaign], "l"), bounds.start, bounds.end) + rangeTotal(series([campaign], "k"), bounds.start, bounds.end);
    const spend = rangeTotal(series([campaign], "s"), bounds.start, bounds.end);
    return { campaign, views, clicks, reach, results, ctr: clicks / Math.max(1, views), spend };
  });
}

export function visibleCampaigns(campaigns: DashCampaign[], query: Pick<DashQuery, "status" | "goal">) {
  return campaigns.filter((campaign) => (!query.status || campaign.status === query.status) && (!query.goal || campaign.goal === query.goal));
}

export function awarenessText(reach: number) {
  return `Awareness goal: reached ${formatCount(reach)} people`;
}

export function funnelCaption(input: { awareness: boolean; views: number; clicks: number; reach: number; results: number }) {
  if (input.awareness) return `${formatCount(input.reach)} people reached · ${oneIn(input.clicks, input.views)} viewers clicked`;
  return `${oneIn(input.clicks, input.views)} viewers clicked; ${oneIn(input.results, input.clicks)} clickers became a lead or call`;
}

export function sourceLine(input: { platforms: DashPlatform[]; updatedLabel: string; accountIds: string[] | null }) {
  const names: string[] = [];
  if (input.platforms.includes("meta") || input.platforms.length === 0) names.push("Meta");
  if (input.platforms.includes("google_ads")) names.push("Google");
  const source = names.length === 1 ? `your ${names[0]} ads` : `your ${names.join(" and ")} ads`;
  const accounts = input.accountIds && input.accountIds.length ? ` · account ${input.accountIds.join(", ")}` : "";
  return `Source: ${source} · updated ${input.updatedLabel}${accounts}`;
}

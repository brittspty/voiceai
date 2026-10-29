export const CLIENT_FIELDS = [
  "date",
  "campaign",
  "ad",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "conversions",
  "leads",
  "frequency",
] as const;

export type ClientCreative = {
  ad: string;
  headline: string;
  body: string;
  previewUrl: string;
};

export type ClientMetric = {
  date: string;
  campaign: string;
  ad: string;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number | null;
  conversions: number;
  leads: number;
  frequency: number | null;
};

export type ClientViewerResponse = {
  client: string;
  metrics: ClientMetric[];
  trends: ClientMetric[];
  creatives: ClientCreative[];
};

const FORBIDDEN_KEY = /spend|budget|cpc|cpm|cpa|roas|cost|cpl|currency|amount/i;

export function clientMetric(row: {
  date: string;
  campaign: string;
  ad: string;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  leads: number;
}): ClientMetric {
  return {
    date: row.date,
    campaign: row.campaign,
    ad: row.ad,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    ctr: row.impressions ? row.clicks / row.impressions : null,
    conversions: row.conversions,
    leads: row.leads,
    frequency: row.reach ? row.impressions / row.reach : null,
  };
}

export function clientTrends(metrics: ClientMetric[]): ClientMetric[] {
  const byDate = new Map<string, ClientMetric>();
  for (const row of metrics) {
    const current = byDate.get(row.date) ?? {
      date: row.date,
      campaign: "All campaigns",
      ad: "All ads",
      impressions: 0,
      reach: 0,
      clicks: 0,
      ctr: null,
      conversions: 0,
      leads: 0,
      frequency: null,
    };
    current.impressions += row.impressions;
    current.reach += row.reach;
    current.clicks += row.clicks;
    current.conversions += row.conversions;
    current.leads += row.leads;
    current.ctr = current.impressions ? current.clicks / current.impressions : null;
    current.frequency = current.reach ? current.impressions / current.reach : null;
    byDate.set(row.date, current);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function clientCreative(row: { ad: string; headline?: string; body?: string; previewUrl?: string }): ClientCreative {
  return {
    ad: row.ad,
    headline: row.headline || "",
    body: row.body || "",
    previewUrl: row.previewUrl || "",
  };
}

/** Allowlist serializer. Extra keys on the input are dropped. */
export function buildClientViewerResponse(input: {
  client: string;
  rows: {
    date: string;
    campaign: string;
    ad: string;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    leads: number;
  }[];
  creatives: { ad: string; headline?: string; body?: string; previewUrl?: string }[];
}): ClientViewerResponse {
  const metrics = input.rows.map((row) => clientMetric(row));
  return {
    client: input.client,
    metrics,
    trends: clientTrends(metrics),
    creatives: input.creatives.map((row) => clientCreative(row)),
  };
}

export function clientViewerCsv(response: ClientViewerResponse) {
  const headers = ["Date", "Campaign", "Ad", "Impressions", "Reach", "Clicks", "Click rate", "Conversions", "Leads", "Frequency"];
  const lines = [headers.join(",")];
  for (const row of response.metrics) {
    lines.push(
      [row.date, row.campaign, row.ad, row.impressions, row.reach, row.clicks, row.ctr ?? "", row.conversions, row.leads, row.frequency ?? ""].join(","),
    );
  }
  return lines.join("\n");
}

export function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

export function forbiddenClientKeys(value: unknown) {
  return collectKeys(value).filter((key) => FORBIDDEN_KEY.test(key));
}

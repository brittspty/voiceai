import { clientQualifiedKpis } from "./lead-score/summary";

const FORBIDDEN_KEY = /spend|budget|cpc|cpm|cpa|roas|cost|cpl|currency|amount|revenue|leadvalue|callvalue|externalid/i;
const FORBIDDEN_TEXT = /spend|cost|cpc|cpm|cpa|budget|roas|revenue|\$/i;

export type ClientCampaign = {
  name: string;
  status: "Doing well" | "Steady" | "Fewer bookings";
  booked: number;
  leads: number;
  channel: string;
  detail: string;
};

export type ClientShareView = {
  client: string;
  viewOnly: true;
  rangeLabel: string;
  kpis: { label: string; value: string; delta: string; meaning: string }[];
  campaigns: ClientCampaign[];
  updated: string;
  sharedBy: string;
  expires: string;
  notes?: string[];
};

export const CLIENT_TESTING_NOTE = "New ad version testing";

export function clientTestingNote(queued: boolean) {
  return queued ? CLIENT_TESTING_NOTE : "";
}

function campaignStatus(booked: number, leads: number): ClientCampaign["status"] {
  if (booked === 0 && leads < 5) return "Fewer bookings";
  if (booked >= 5) return "Doing well";
  return "Steady";
}

export function buildClientShare(input: {
  client: string;
  adViews: number;
  leads: number;
  booked: number;
  campaigns: { name: string; channel: string; leads: number; booked: number; note?: string }[];
  sharedBy?: string;
  expires?: string;
  rangeLabel?: string;
  updated?: string;
  qualified?: { count: number; total: number; delta: number; period?: "week" | "period" } | null;
  notes?: string[];
}): ClientShareView {
  const notes = (input.notes ?? []).map((note) => note.trim()).filter(Boolean);
  const campaigns = input.campaigns.map((row) => {
    const status = campaignStatus(row.booked, row.leads);
    const note = row.note ? ` · ${row.note}` : "";
    return {
      name: row.name,
      status,
      booked: row.booked,
      leads: row.leads,
      channel: row.channel,
      detail: `${row.booked} booked calls · ${row.leads} leads · ${row.channel}${note}`,
    };
  });
  return {
    client: input.client,
    viewOnly: true,
    rangeLabel: input.rangeLabel || "Last 7 days",
    kpis: [
      {
        label: "Booked calls",
        value: String(input.booked),
        delta: "",
        meaning: "People who booked a call or visit with you.",
      },
      {
        label: "New leads",
        value: String(input.leads),
        delta: "",
        meaning: "People who asked for a quote or info.",
      },
      {
        label: "Called within 5 min",
        value: "Not measured yet",
        delta: "",
        meaning: "How fast new leads heard from you.",
      },
      {
        label: "Ad views",
        value: input.adViews.toLocaleString("en-US"),
        delta: "",
        meaning: "How many times people saw your ads.",
      },
      ...clientQualifiedKpis(input.qualified),
    ],
    campaigns,
    updated: input.updated || "Updated just now",
    sharedBy: input.sharedBy || "your marketing team",
    expires: input.expires || "",
    ...(notes.length ? { notes } : {}),
  };
}

export function clientShareText(view: ClientShareView) {
  return [
    view.client,
    view.rangeLabel,
    ...view.kpis.flatMap((row) => [row.label, row.value, row.delta, row.meaning]),
    ...view.campaigns.flatMap((row) => [row.name, row.status, row.detail]),
    view.updated,
    view.sharedBy,
    view.expires,
    ...(view.notes ?? []),
  ].join(" ");
}

export function clientShareCsv(view: ClientShareView) {
  const lines = ["Campaign,Status,Booked calls,Leads,Channel"];
  for (const row of view.campaigns) {
    lines.push([row.name, row.status, row.booked, row.leads, row.channel].join(","));
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

/** Drop spend, cost, and the other client-forbidden keys. Client payloads must not contain them at all. */
export function omitForbiddenClientFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => omitForbiddenClientFields(item)) as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) continue;
      out[key] = omitForbiddenClientFields(child);
    }
    return out as T;
  }
  return value;
}

export function clientShareHasMoney(view: ClientShareView) {
  return FORBIDDEN_TEXT.test(clientShareText(view)) || FORBIDDEN_TEXT.test(clientShareCsv(view));
}

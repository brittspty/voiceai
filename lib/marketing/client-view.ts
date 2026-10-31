import { clientQualifiedKpis } from "./lead-score/summary";
import { formatKpi } from "./reports/format";
import { reportFooterLine } from "./reports/brand";
import type { ClientChannel, ClientKpi, ClientReport, ReportChannel, ReportFlag, StaffReport } from "./reports/types";

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

export function clientShareHasMoney(view: ClientShareView) {
  return FORBIDDEN_TEXT.test(clientShareText(view)) || FORBIDDEN_TEXT.test(clientShareCsv(view));
}

/** Contract scan for reports, PDFs, and share snapshots. */
export const REPORT_COST_TEXT = /spend|cost|cpl|cpql|cpa|roas|budget|\$/i;
export const REPORT_COST_KEY = /spend|budget|cpc|cpm|cpa|roas|cost|cpl|cpql|currency|amount|revenue/i;
const STAFF_SERIES = /cpql|cpa|cpl|roas|spend|cost|budget/i;
const MONEY_FORMAT = new Set(["currency", "multiple"]);

export function forbiddenReportKeys(value: unknown) {
  return collectKeys(value).filter((key) => REPORT_COST_KEY.test(key));
}

export function reportPayloadHasCost(value: unknown) {
  return forbiddenReportKeys(value).length > 0 || REPORT_COST_TEXT.test(JSON.stringify(value) ?? "");
}

function cleanSentence(value: string | undefined) {
  const text = (value || "").trim();
  if (!text || REPORT_COST_TEXT.test(text)) return undefined;
  return text;
}

function mustClean(value: string, fallback: string) {
  return cleanSentence(value) || fallback;
}

function cleanFlag(flag: ReportFlag): ReportFlag | null {
  const title = cleanSentence(flag.title);
  const detail = cleanSentence(flag.detail);
  if (!title || !detail) return null;
  return { id: flag.id, kind: flag.kind, title, detail };
}

export function toClientReport(staff: StaffReport): ClientReport {
  const series = staff.series
    .filter((item) => !item.staffOnly && !STAFF_SERIES.test(item.id) && item.unit !== "dollars")
    .map((item) => ({
      id: item.id,
      title: mustClean(item.title, "Results"),
      unit: item.unit,
      goal: item.goal,
      goalLabel: cleanSentence(item.goalLabel) || "",
      points: item.points.map((point) => {
        const splits = point.splits.map((split) => ({ name: mustClean(split.clientName, "Channel"), value: split.value }));
        return {
          date: point.date,
          label: point.label,
          value: point.value,
          prior: point.prior,
          splits,
          splitText: cleanSentence(point.clientSplitText) || "",
        };
      }),
    }));
  const kpis: ClientKpi[] = [];
  for (const kpi of staff.clientKpis) {
    if (kpi.staffOnly || MONEY_FORMAT.has(kpi.format) || REPORT_COST_KEY.test(kpi.id) || REPORT_COST_TEXT.test(kpi.label)) continue;
    const format = kpi.format as ClientKpi["format"];
    const why = cleanSentence(kpi.why);
    kpis.push({
      id: kpi.id,
      label: kpi.label,
      definition: cleanSentence(kpi.definition) || kpi.label,
      value: kpi.value,
      format,
      delta: cleanSentence(kpi.delta) || "",
      tone: kpi.tone,
      spark: kpi.spark,
      ...(why ? { why } : {}),
    });
  }
  const flags = staff.clientFlags.map(cleanFlag).filter((flag): flag is ReportFlag => Boolean(flag));
  const defaultSeriesId = series.some((item) => item.id === staff.clientDefaultSeriesId) ? staff.clientDefaultSeriesId : series[0]?.id || "";
  return {
    audience: "client",
    sourceId: staff.sourceId,
    exampleData: staff.exampleData,
    updatedAt: staff.updatedAt,
    clientId: staff.clientId,
    clientName: mustClean(staff.clientName, "Your business"),
    scopeLabel: mustClean(staff.scopeLabel, "Your business"),
    headline: mustClean(staff.clientHeadline, "Your results"),
    subhead: mustClean(staff.clientSubhead, "A person is counted once across channels."),
    periodLabel: mustClean(staff.periodLabel, "This period"),
    compareLabel: mustClean(staff.compareLabel, "prior period"),
    compare: staff.compare,
    range: staff.range,
    attribution: mustClean(staff.clientAttribution, "A person is counted once."),
    kpis,
    series,
    defaultSeriesId,
    annotations: staff.annotations.flatMap((note) => {
      if (!series.some((item) => item.id === note.seriesId)) return [];
      const body = cleanSentence(note.clientBody) || cleanSentence(note.body);
      if (!body) return [];
      return [{ date: note.date, seriesId: note.seriesId, label: cleanSentence(note.label) || "Note", body }];
    }),
    channels: staff.channels.map((row) => ({
      id: row.id,
      name: mustClean(row.clientName, "Channel"),
      qualified: row.qualified,
      leads: row.leads,
      booked: row.booked,
      color: row.color,
    })),
    funnel: staff.clientFunnel.flatMap((step) => {
      const label = cleanSentence(step.label);
      if (!label) return [];
      return [{ id: step.id, label, value: step.value, share: cleanSentence(step.share) || "" }];
    }),
    channelHeading: mustClean(staff.clientChannelHeading, "Where your leads came from"),
    flags,
    flagsHeading: mustClean(staff.clientFlagsHeading, "Heads up"),
    pdf: {
      kicker: mustClean(staff.clientPdf.kicker, "Performance report"),
      coverSentence: mustClean(staff.clientPdf.coverSentence, "Results for this period."),
      resultsKicker: mustClean(staff.clientPdf.resultsKicker, "01 · Results"),
      resultsTitle: mustClean(staff.clientPdf.resultsTitle, "Results"),
      preparer: mustClean(staff.clientPdf.preparer, "Your marketing team"),
      annotation: cleanSentence(staff.clientPdf.annotation) || "",
      periodName: mustClean(staff.clientPdf.periodName, "This period"),
    },
    footer: cleanSentence(staff.footer) || reportFooterLine(),
  };
}

export function sealClientReport(staff: StaffReport): ClientReport {
  const client = toClientReport(staff);
  if (reportPayloadHasCost(client)) throw new Error("Client report includes cost fields.");
  return client;
}

export function scrubCost(value: unknown): unknown {
  if (typeof value === "string") return REPORT_COST_TEXT.test(value) ? "" : value;
  if (Array.isArray(value)) return value.map(scrubCost);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (REPORT_COST_KEY.test(key)) continue;
      out[key] = scrubCost(child);
    }
    return out;
  }
  return value;
}

export function reopenClientReport(value: unknown): ClientReport {
  const scrubbed = scrubCost(value);
  if (reportPayloadHasCost(scrubbed)) throw new Error("Client report includes cost fields.");
  return scrubbed as ClientReport;
}

export function reportPdfLines(report: StaffReport | ClientReport) {
  const kpiLines = report.kpis.flatMap((kpi) => [kpi.label, formatKpi(kpi.value, kpi.format), kpi.delta, kpi.why || ""]);
  const channelLines = report.channels.flatMap((row) => {
    if ("cpl" in row && report.audience === "staff") {
      const staff = row as ReportChannel;
      const money = staff.cpl == null ? "n/a" : `$${staff.cpl.toFixed(2)}`;
      return [staff.staffName, String(staff.qualified), String(staff.leads), String(staff.booked), money];
    }
    const client = row as ClientChannel;
    return [client.name, String(client.leads), String(client.qualified), String(client.booked)];
  });
  const funnelLines = report.funnel.flatMap((step) => [step.label, String(step.value), step.share]);
  const flagLines = report.flags.flatMap((flag) => [flag.title, flag.detail]);
  return [
    report.footer,
    report.exampleData ? "EXAMPLE DATA" : "",
    report.pdf.kicker,
    report.clientName,
    report.headline,
    report.subhead,
    report.pdf.coverSentence,
    `Prepared by ${report.pdf.preparer}`,
    report.pdf.resultsKicker,
    report.pdf.resultsTitle,
    report.pdf.annotation,
    report.attribution,
    ...kpiLines,
    ...channelLines,
    ...funnelLines,
    ...flagLines,
    report.pdf.periodName,
  ].filter((line) => line.trim().length > 0);
}

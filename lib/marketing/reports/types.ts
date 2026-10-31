export type ReportRange = "7d" | "30d" | "qtd" | "custom";
export type ReportCompare = "prior" | "none";
export type KpiFormat = "integer" | "currency" | "multiple" | "seconds" | "percent" | "rating";
export type DeltaTone = "good" | "bad";
export type FlagKind = "anomaly" | "opportunity" | "up" | "heads_up";

export type ReportQuery = {
  range: ReportRange;
  compare: ReportCompare;
  clientId: string;
  start?: string;
  end?: string;
};

export type ReportSplit = {
  staffName: string;
  clientName: string;
  value: number;
};

export type ReportPoint = {
  date: string;
  label: string;
  value: number;
  prior: number;
  splits: ReportSplit[];
  staffSplitText?: string;
  clientSplitText?: string;
  staffNote?: string;
};

export type ReportSeries = {
  id: string;
  title: string;
  unit: string;
  staffOnly: boolean;
  goal: number | null;
  goalLabel: string;
  points: ReportPoint[];
};

export type ReportKpi = {
  id: string;
  label: string;
  definition: string;
  staffOnly: boolean;
  value: number;
  format: KpiFormat;
  delta: string;
  tone: DeltaTone;
  spark: number[];
  why?: string;
};

export type ReportChannel = {
  id: string;
  staffName: string;
  clientName: string;
  qualified: number;
  leads: number;
  booked: number;
  cpl: number | null;
  color: string;
};

export type ReportFunnelStep = {
  id: string;
  label: string;
  value: number;
  share: string;
};

export type ReportFlag = {
  id: string;
  kind: FlagKind;
  title: string;
  detail: string;
  href?: string;
};

export type ReportCohort = {
  columns: string[];
  rows: { label: string; values: (number | null)[] }[];
  note: string;
};

export type ReportPdfCopy = {
  kicker: string;
  coverSentence: string;
  resultsKicker: string;
  resultsTitle: string;
  preparer: string;
  annotation: string;
  periodName: string;
};

export type ReportAnnotation = {
  date: string;
  seriesId: string;
  label: string;
  body: string;
  clientBody?: string;
};

export type StaffReport = {
  audience: "staff";
  sourceId: string;
  exampleData: boolean;
  updatedAt: string;
  clientId: string;
  clientName: string;
  scopeLabel: string;
  headline: string;
  clientHeadline: string;
  subhead: string;
  clientSubhead: string;
  periodLabel: string;
  compareLabel: string;
  compare: ReportCompare;
  range: ReportRange;
  attribution: string;
  clientAttribution: string;
  kpis: ReportKpi[];
  clientKpis: ReportKpi[];
  series: ReportSeries[];
  defaultSeriesId: string;
  clientDefaultSeriesId: string;
  annotations: ReportAnnotation[];
  channels: ReportChannel[];
  funnel: ReportFunnelStep[];
  clientFunnel: ReportFunnelStep[];
  channelHeading: string;
  clientChannelHeading: string;
  channelMetric: string;
  flags: ReportFlag[];
  clientFlags: ReportFlag[];
  flagsHeading: string;
  clientFlagsHeading: string;
  cohort: ReportCohort | null;
  pdf: ReportPdfCopy;
  clientPdf: ReportPdfCopy;
  footer: string;
  clients: { id: string; name: string }[];
};

export type ClientPoint = {
  date: string;
  label: string;
  value: number;
  prior: number;
  splits: { name: string; value: number }[];
  splitText: string;
};

export type ClientSeries = {
  id: string;
  title: string;
  unit: string;
  goal: number | null;
  goalLabel: string;
  points: ClientPoint[];
};

export type ClientKpi = {
  id: string;
  label: string;
  definition: string;
  value: number;
  format: Exclude<KpiFormat, "currency" | "multiple">;
  delta: string;
  tone: DeltaTone;
  spark: number[];
  why?: string;
};

export type ClientChannel = {
  id: string;
  name: string;
  qualified: number;
  leads: number;
  booked: number;
  color: string;
};

export type ClientReport = {
  audience: "client";
  sourceId: string;
  exampleData: boolean;
  updatedAt: string;
  clientId: string;
  clientName: string;
  scopeLabel: string;
  headline: string;
  subhead: string;
  periodLabel: string;
  compareLabel: string;
  compare: ReportCompare;
  range: ReportRange;
  attribution: string;
  kpis: ClientKpi[];
  series: ClientSeries[];
  defaultSeriesId: string;
  annotations: { date: string; seriesId: string; label: string; body: string }[];
  channels: ClientChannel[];
  funnel: ReportFunnelStep[];
  channelHeading: string;
  flags: ReportFlag[];
  flagsHeading: string;
  pdf: ReportPdfCopy;
  footer: string;
};

export type ReportDocument = StaffReport | ClientReport;

/** Cross-channel metrics (bc-e4d5d029) and the example source both satisfy this. */
export interface ReportMetricsSource {
  id: string;
  available(): boolean;
  load(query: ReportQuery): Promise<StaffReport>;
}

import { BRAND_WORDMARK } from "../../brand";
import { reportFooterLine } from "./brand";
import { addIsoDays, axisLabel } from "./format";
import type { ReportChannel, ReportMetricsSource, ReportPoint, ReportQuery, ReportSeries, ReportSplit, StaffReport } from "./types";

const START = "2026-10-01";
const COLORS = ["#FF5800", "#F5F2F0", "#7DB9E8", "#8A817E"];

const QUALIFIED = [8, 9, 9, 7, 7, 10, 11, 10, 8, 9, 10, 12, 11, 10, 11, 13, 14, 12, 11, 11, 13, 15, 14, 13, 14, 15, 16, 14, 13, 15];
const VISITS = [42, 44, 43, 40, 41, 48, 52, 50, 40, 46, 55, 60, 58, 54, 57, 62, 66, 61, 58, 60, 68, 74, 70, 66, 69, 72, 76, 71, 68, 73];

const STAFF_NAMES: ReportSplit[] = [
  { staffName: "Meta", clientName: "Facebook & Instagram ads", value: 0 },
  { staffName: "Google Ads", clientName: "Google search ads", value: 0 },
  { staffName: "Google Business Profile", clientName: "Google Maps listing", value: 0 },
  { staffName: "StackAdapt", clientName: "Display ads", value: 0 },
];

const HARBOR_NAMES: ReportSplit[] = [
  { staffName: "Google Ads", clientName: "Google", value: 0 },
  { staffName: "Meta", clientName: "Facebook", value: 0 },
  { staffName: "Google Business Profile", clientName: "Maps", value: 0 },
];

export const REPORT_CLIENTS = [
  { id: "all", name: "All clients" },
  { id: "harbor", name: "Harbor Dental" },
];

function iso(index: number) {
  return addIsoDays(START, index);
}

function distribute(total: number, weights: number[]) {
  const raw = weights.map((weight) => Math.round(total * weight));
  raw[0] = (raw[0] ?? 0) + (total - raw.reduce((sum, n) => sum + n, 0));
  return raw;
}

function seriesFrom(
  id: string,
  title: string,
  unit: string,
  values: number[],
  names: ReportSplit[],
  weights: number[],
  goal: number | null,
  goalLabel: string,
  staffOnly: boolean,
  featured?: { index: number; prior: number; parts: number[]; staffSplitText?: string; clientSplitText?: string; staffNote?: string },
): ReportSeries {
  const points: ReportPoint[] = values.map((value, index) => {
    const parts = featured?.index === index ? featured.parts : distribute(value, weights);
    const splits = names.map((name, i) => ({ ...name, value: parts[i] ?? 0 }));
    const prior = featured?.index === index ? featured.prior : Math.max(0, Math.round(value * 0.84 - (index % 3)));
    const point: ReportPoint = {
      date: iso(index),
      label: axisLabel(iso(index)),
      value,
      prior,
      splits,
    };
    if (featured?.index === index) {
      point.staffSplitText = featured.staffSplitText;
      point.clientSplitText = featured.clientSplitText;
      point.staffNote = featured.staffNote;
    }
    return point;
  });
  return { id, title, unit, staffOnly, goal, goalLabel, points };
}

function channel(
  id: string,
  staffName: string,
  clientName: string,
  qualified: number,
  leads: number,
  booked: number,
  cpl: number | null,
  color: string,
): ReportChannel {
  return { id, staffName, clientName, qualified, leads, booked, cpl, color };
}

const COHORT = {
  columns: ["Wk 0", "Wk 1", "Wk 2", "Wk 3", "Wk 4"],
  rows: [
    { label: "Sep 28", values: [18, 31, 38, 41, 42] },
    { label: "Oct 5", values: [20, 34, 40, 43, null] },
    { label: "Oct 12", values: [22, 36, 44, null, null] },
    { label: "Oct 19", values: [25, 39, null, null, null] },
    { label: "Oct 26", values: [27, null, null, null, null] },
  ],
  note: "Newer weeks book faster: 27% in week 0 vs 18% five weeks ago, mostly from 30-second callbacks.",
};

function shell(partial: Omit<StaffReport, "footer" | "clients" | "updatedAt" | "sourceId" | "audience" | "exampleData">): StaffReport {
  return {
    audience: "staff",
    sourceId: "example",
    exampleData: true,
    updatedAt: new Date().toISOString(),
    footer: reportFooterLine(),
    clients: REPORT_CLIENTS,
    ...partial,
  };
}

function allClients(): StaffReport {
  const qualified = seriesFrom(
    "qualified",
    "Qualified leads per day",
    "qualified",
    QUALIFIED,
    STAFF_NAMES,
    [0.45, 0.37, 0.13, 0.05],
    12,
    "GOAL 12/DAY",
    false,
    {
      index: 21,
      prior: 11,
      parts: [6, 7, 3, 0],
      staffSplitText: "Meta 6 · Google 7 · GBP 3",
      clientSplitText: "Facebook & Instagram ads 6 · Google search ads 7 · Google Maps listing 3",
      staffNote: "CPQL $104",
    },
  );
  const leads = seriesFrom("leads", "Leads per day", "leads", QUALIFIED.map((n) => n * 3), STAFF_NAMES, [0.48, 0.35, 0.1, 0.07], null, "", false);
  const booked = seriesFrom("booked", "Booked per day", "booked", QUALIFIED.map((n) => Math.max(1, Math.round(n * 0.43))), STAFF_NAMES, [0.4, 0.35, 0.15, 0.1], null, "", false);
  const cpql = seriesFrom(
    "cpql",
    "Cost per qualified lead",
    "dollars",
    QUALIFIED.map((_, i) => Math.round(140 - i * 1.1)),
    STAFF_NAMES,
    [0.4, 0.35, 0.05, 0.2],
    null,
    "",
    true,
  );
  const speedSpark = [36, 32, 28, 38, 44, 34, 22, 30, 38, 36, 28, 24, 30, 42, 40, 28, 18, 36, 46, 32, 24, 20, 32, 40, 22, 20, 18, 34, 32, 26];
  return shell({
    clientId: "all",
    clientName: "All clients",
    scopeLabel: "All clients",
    headline: "October performance · All clients",
    clientHeadline: "All clients · 305 qualified leads in October",
    subhead: "Oct 1–30 vs Sep 1–30 · Blended across Meta, Google Ads, StackAdapt, Google Business Profile, landing pages, leads and AIS2L",
    clientSubhead: "Oct 1–30 vs Sep 1–30. A person is counted once across channels.",
    periodLabel: "Oct 1–30 vs Sep 1–30",
    compareLabel: "prior period",
    compare: "prior",
    range: "30d",
    attribution: "Attribution: last non-direct touch, 7-day click / 1-day view. A person is counted once across channels.",
    clientAttribution: "A person who found you two ways is counted once.",
    kpis: [
      {
        id: "qualified",
        label: "Qualified leads · all channels",
        definition: "Leads marked a real prospect by staff or the client owner.",
        staffOnly: false,
        value: 305,
        format: "integer",
        delta: "▲ 18% vs prior · 2% above goal",
        tone: "good",
        spark: QUALIFIED,
        why: "Google search ads added 41 qualified leads after the Oct 9 launch; StackAdapt fell 6.",
      },
      {
        id: "cpql",
        label: "Cost per qualified lead",
        definition: "Spend divided by qualified leads.",
        staffOnly: true,
        value: 116,
        format: "currency",
        delta: "▼ $9 better than prior",
        tone: "good",
        spark: cpql.points.map((point) => point.value),
      },
      {
        id: "roas",
        label: "ROAS",
        definition: "Revenue divided by spend, when revenue is synced.",
        staffOnly: true,
        value: 4.2,
        format: "multiple",
        delta: "▲ 0.6 vs prior · goal 4.0×",
        tone: "good",
        spark: [2.8, 3.1, 3.0, 3.4, 3.6, 3.5, 3.8, 4.0, 4.2],
      },
      {
        id: "speed",
        label: "Median speed to lead",
        definition: "Median time from a visit to the first call. Goal is 30 seconds.",
        staffOnly: false,
        value: 41,
        format: "seconds",
        delta: "▲ 11s over 30s goal",
        tone: "bad",
        spark: speedSpark,
      },
    ],
    clientKpis: [
      {
        id: "qualified",
        label: "Qualified leads",
        definition: "Leads marked a real prospect by you or your team.",
        staffOnly: false,
        value: 305,
        format: "integer",
        delta: "▲ 18% vs prior · 2% above goal",
        tone: "good",
        spark: QUALIFIED,
        why: "Google search ads added 41 qualified leads after the Oct 9 launch; StackAdapt fell 6.",
      },
      {
        id: "booked",
        label: "Booked appointments",
        definition: "Appointments booked from those leads.",
        staffOnly: false,
        value: 132,
        format: "integer",
        delta: "▲ 12 vs prior",
        tone: "good",
        spark: booked.points.map((point) => point.value),
      },
      {
        id: "leads",
        label: "Leads",
        definition: "Form fills, calls, and messages, once per person.",
        staffOnly: false,
        value: 857,
        format: "integer",
        delta: "▲ 9% vs prior",
        tone: "good",
        spark: leads.points.map((point) => point.value),
      },
      {
        id: "speed",
        label: "Median speed to lead",
        definition: "Median time from a visit to the first call. Goal is 30 seconds.",
        staffOnly: false,
        value: 41,
        format: "seconds",
        delta: "▲ 11s over 30s goal",
        tone: "bad",
        spark: speedSpark,
      },
    ],
    series: [qualified, leads, booked, cpql],
    defaultSeriesId: "qualified",
    clientDefaultSeriesId: "qualified",
    annotations: [
      {
        date: "2026-10-09",
        seriesId: "qualified",
        label: "Oct 9 · annotation",
        body: "New Google search ads went live. Qualified leads jumped from 8 to 12 a day within 3 days.",
      },
    ],
    channels: [
      channel("meta", "Meta", "Facebook & Instagram ads", 138, 412, 54, 44.7, COLORS[0]),
      channel("google", "Google Ads", "Google search ads", 112, 296, 48, 43.8, COLORS[1]),
      channel("gbp", "Google Business Profile", "Google Maps listing", 41, 88, 22, null, COLORS[2]),
      channel("stackadapt", "StackAdapt", "Display ads", 14, 61, 8, 68, COLORS[3]),
    ],
    funnel: [
      { id: "clicks", label: "Clicks", value: 9840, share: "" },
      { id: "leads", label: "Leads", value: 857, share: "9% of clicks" },
      { id: "qualified", label: "Qualified", value: 305, share: "36% of leads" },
      { id: "booked", label: "Booked", value: 132, share: "43% of qualified" },
    ],
    clientFunnel: [
      { id: "clicks", label: "Clicks", value: 9840, share: "" },
      { id: "leads", label: "Leads", value: 857, share: "9% of clicks" },
      { id: "qualified", label: "Qualified", value: 305, share: "36% of leads" },
      { id: "booked", label: "Booked", value: 132, share: "43% of qualified" },
    ],
    channelHeading: "Channel comparison",
    clientChannelHeading: "Where your leads came from",
    channelMetric: "qualified",
    flags: [
      {
        id: "stackadapt",
        kind: "anomaly",
        title: "StackAdapt CPL up 41%",
        detail: "$68 vs $48 prior. Display placements on 3 news sites drove 70% of spend with 2 leads.",
        href: "/marketing",
      },
      {
        id: "speed",
        kind: "anomaly",
        title: "Speed to lead slipped to 41s",
        detail: "Weekend form leads waited 2–4 min. AIS2L was in TEST mode Sat–Sun.",
        href: "/marketing/speed-to-lead",
      },
      {
        id: "search",
        kind: "opportunity",
        title: "Google search has headroom",
        detail: "Lost 22% of impressions to budget at $43.80 CPL. Recommendation only: see Decisions.",
        href: "/marketing",
      },
      {
        id: "gbp",
        kind: "opportunity",
        title: "GBP calls up 3×",
        detail: "3 new 5-star reviews; post weekly to keep it.",
      },
    ],
    clientFlags: [
      {
        id: "speed",
        kind: "anomaly",
        title: "Speed to lead slipped to 41s",
        detail: "Weekend form leads waited 2–4 min. AIS2L was in TEST mode Sat–Sun.",
      },
      {
        id: "gbp",
        kind: "opportunity",
        title: "Google Maps calls up 3×",
        detail: "3 new 5-star reviews; post weekly to keep it.",
      },
    ],
    flagsHeading: "Flags",
    clientFlagsHeading: "Heads up",
    cohort: COHORT,
    pdf: {
      kicker: "Performance report · October 2026",
      coverSentence: "305 qualified leads, 18% above the prior period. 132 appointments booked.",
      resultsKicker: "01 · Results",
      resultsTitle: "Qualified leads rose after Oct 9",
      preparer: `Dana Reyes, ${BRAND_WORDMARK} · Oct 31, 2026`,
      annotation: "Oct 9: new Google search ads went live; daily qualified leads rose from 8 to 12.",
      periodName: "October 2026",
    },
    clientPdf: {
      kicker: "Performance report · October 2026",
      coverSentence: "305 qualified leads, 18% above the prior period. 132 appointments booked.",
      resultsKicker: "01 · Results",
      resultsTitle: "Qualified leads rose after Oct 9",
      preparer: `Dana Reyes, ${BRAND_WORDMARK} · Oct 31, 2026`,
      annotation: "Oct 9: new Google search ads went live; daily qualified leads rose from 8 to 12.",
      periodName: "October 2026",
    },
  });
}

function harbor(): StaffReport {
  const visits = seriesFrom(
    "visits",
    "Website visits per day",
    "visits",
    VISITS,
    HARBOR_NAMES,
    [0.42, 0.38, 0.2],
    60,
    "GOAL 60/DAY",
    false,
    {
      index: 21,
      prior: 52,
      parts: [31, 28, 16],
      clientSplitText: "Google 31 · Facebook 28 · Maps 16",
      staffSplitText: "Google 31 · Facebook 28 · Maps 16",
    },
  );
  const leads = seriesFrom("leads", "Leads per day", "leads", VISITS.map((n) => Math.max(1, Math.round(n / 18))), HARBOR_NAMES, [0.4, 0.4, 0.2], null, "", false);
  const booked = seriesFrom("booked", "Booked per day", "booked", VISITS.map((n) => Math.max(0, Math.round(n / 80))), HARBOR_NAMES, [0.4, 0.4, 0.2], null, "", false);
  const cpql = seriesFrom("cpql", "Cost per qualified lead", "dollars", VISITS.map((_, i) => 90 + (i % 5)), HARBOR_NAMES, [0.5, 0.4, 0.1], null, "", true);
  return shell({
    clientId: "harbor",
    clientName: "Harbor Dental",
    scopeLabel: "Harbor Dental",
    headline: "Harbor Dental · October performance",
    clientHeadline: "Harbor Dental · You got 48 qualified leads in October",
    subhead: "Oct 1–30 vs Sep 1–30 · Harbor Dental",
    clientSubhead: "6 more than September. Most came from Google search ads and your Facebook & Instagram ads.",
    periodLabel: "Oct 1–30 vs Sep 1–30",
    compareLabel: "September",
    compare: "prior",
    range: "30d",
    attribution: "Attribution: last non-direct touch, 7-day click / 1-day view. A person is counted once across channels.",
    clientAttribution: "A person who found you two ways is counted once.",
    kpis: [
      {
        id: "qualified",
        label: "Qualified leads",
        definition: "Leads marked a real prospect by you or your team.",
        staffOnly: false,
        value: 48,
        format: "integer",
        delta: "▲ 6 vs September · goal 45",
        tone: "good",
        spark: VISITS.map((n) => Math.max(1, Math.round(n / 20))),
        why: "new Google search ads for “emergency dentist” started Oct 9 and brought 11 qualified leads.",
      },
      {
        id: "cpql",
        label: "Cost per qualified lead",
        definition: "Spend divided by qualified leads.",
        staffOnly: true,
        value: 92,
        format: "currency",
        delta: "▼ $4 better than September",
        tone: "good",
        spark: cpql.points.map((point) => point.value),
      },
      {
        id: "booked",
        label: "Booked appointments",
        definition: "Appointments booked from those leads.",
        staffOnly: false,
        value: 21,
        format: "integer",
        delta: "▲ 4 vs September",
        tone: "good",
        spark: booked.points.map((point) => point.value),
      },
      {
        id: "callback",
        label: "Called back in 30s",
        definition: "Share of new leads contacted within 30 seconds.",
        staffOnly: false,
        value: 86,
        format: "percent",
        delta: "goal 90% · 4 pts short",
        tone: "bad",
        spark: [80, 84, 82, 88, 86, 90, 85, 86],
      },
    ],
    clientKpis: [
      {
        id: "qualified",
        label: "Qualified leads",
        definition: "Leads marked a real prospect by you or your team.",
        staffOnly: false,
        value: 48,
        format: "integer",
        delta: "▲ 6 vs September · goal 45",
        tone: "good",
        spark: [1, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2],
        why: "new Google search ads for “emergency dentist” started Oct 9 and brought 11 qualified leads.",
      },
      {
        id: "booked",
        label: "Booked appointments",
        definition: "Appointments booked from those leads.",
        staffOnly: false,
        value: 21,
        format: "integer",
        delta: "▲ 4 vs September",
        tone: "good",
        spark: booked.points.map((point) => point.value),
      },
      {
        id: "callback",
        label: "Called back in 30s",
        definition: "Share of new leads contacted within 30 seconds. Goal is 30 seconds.",
        staffOnly: false,
        value: 86,
        format: "percent",
        delta: "goal 90% · 4 pts short",
        tone: "bad",
        spark: [80, 84, 82, 88, 86, 90, 85, 86, 84, 87, 86, 85, 88, 86, 84, 90, 86, 85, 87, 86, 88, 84, 86, 85, 87, 86, 88, 86, 85, 86],
      },
      {
        id: "rating",
        label: "Google rating",
        definition: "Average star rating on your Google Maps listing.",
        staffOnly: false,
        value: 4.8,
        format: "rating",
        delta: "3 new reviews",
        tone: "good",
        spark: [4.6, 4.6, 4.7, 4.7, 4.7, 4.8, 4.8, 4.8],
      },
    ],
    series: [visits, leads, booked, cpql],
    defaultSeriesId: "visits",
    clientDefaultSeriesId: "visits",
    annotations: [
      {
        date: "2026-10-09",
        seriesId: "visits",
        label: "Oct 9 · annotation",
        body: "New Google search ads went live. Daily website visits rose from 40 to 60 within 3 days.",
        clientBody: "New Google search ads went live. Daily website visits rose from 40 to 60 within 3 days.",
      },
    ],
    channels: [
      channel("meta", "Meta", "Facebook & Instagram ads", 19, 58, 8, 38.2, COLORS[0]),
      channel("google", "Google Ads", "Google search ads", 17, 41, 8, 36.4, COLORS[1]),
      channel("gbp", "Google Business Profile", "Google Maps listing", 9, 22, 4, null, COLORS[2]),
      channel("display", "StackAdapt", "Display ads", 3, 11, 1, 71, COLORS[3]),
    ],
    funnel: [
      { id: "visits", label: "Visits", value: 2310, share: "" },
      { id: "leads", label: "Leads", value: 132, share: "6% of visits" },
      { id: "qualified", label: "Qualified", value: 48, share: "36% of leads" },
      { id: "booked", label: "Booked", value: 21, share: "44% of qualified" },
    ],
    clientFunnel: [
      { id: "visits", label: "Visits", value: 2310, share: "" },
      { id: "leads", label: "Leads", value: 132, share: "6% of visits" },
      { id: "qualified", label: "Qualified", value: 48, share: "36% of leads" },
      { id: "booked", label: "Booked", value: 21, share: "44% of qualified" },
    ],
    channelHeading: "Channel comparison",
    clientChannelHeading: "Where your leads came from",
    channelMetric: "qualified",
    flags: [
      {
        id: "cpl",
        kind: "anomaly",
        title: "Display CPL up",
        detail: "Display ads cost $71 per lead this month. Recommendation only.",
        href: "/marketing",
      },
      {
        id: "pages",
        kind: "up",
        title: "All 3 landing pages online",
        detail: "Loaded in 1.4s on mobile, faster than 80% of dental sites.",
      },
    ],
    clientFlags: [
      {
        id: "pages",
        kind: "up",
        title: "All 3 landing pages online",
        detail: "Loaded in 1.4s on mobile, faster than 80% of dental sites.",
      },
      {
        id: "calls",
        kind: "up",
        title: "AIS2L answered 64 calls",
        detail: "22 became appointments. Summaries are in AIS2L · Calls.",
      },
      {
        id: "weekend",
        kind: "heads_up",
        title: "4 weekend leads waited over 2 minutes",
        detail: "Your account manager, Dana, is fixing weekend coverage.",
      },
    ],
    flagsHeading: "Flags",
    clientFlagsHeading: "Your site and calls",
    cohort: COHORT,
    pdf: {
      kicker: "Performance report · October 2026",
      coverSentence: "48 qualified leads, 6 more than September. 21 appointments booked. Staff copy includes cost.",
      resultsKicker: "01 · Results",
      resultsTitle: "Leads grew every week in October",
      preparer: `Dana Reyes, ${BRAND_WORDMARK} · Oct 31, 2026`,
      annotation: "Oct 9: new Google search ads went live. Staff detail: CPL $36.40.",
      periodName: "October 2026",
    },
    clientPdf: {
      kicker: "Performance report · October 2026",
      coverSentence: "48 qualified leads, 6 more than September. 21 appointments booked.",
      resultsKicker: "01 · Results",
      resultsTitle: "Leads grew every week in October",
      preparer: `Dana Reyes, ${BRAND_WORDMARK} · Oct 31, 2026`,
      annotation: "Oct 9: new Google search ads went live; daily qualified leads rose from 8 to 12.",
      periodName: "October 2026",
    },
  });
}

function windowFor(dates: string[], query: ReportQuery) {
  const sorted = [...dates].sort();
  const last = sorted[sorted.length - 1] || START;
  const first = sorted[0] || START;
  if (query.range === "7d") return { start: addIsoDays(last, -6), end: last };
  if (query.range === "custom") return { start: query.start || first, end: query.end || last };
  return { start: first, end: last };
}

function applyQuery(report: StaffReport, query: ReportQuery): StaffReport {
  const dates = report.series[0]?.points.map((point) => point.date) ?? [];
  const span = windowFor(dates, query);
  const periodLabel = query.range === "7d" ? "Last 7 days" : query.range === "custom" ? `${span.start} – ${span.end}` : report.periodLabel;
  return {
    ...report,
    range: query.range,
    compare: query.compare,
    compareLabel: query.compare === "none" ? "none" : report.compareLabel,
    periodLabel,
    series: report.series.map((item) => ({
      ...item,
      points: item.points.filter((point) => point.date >= span.start && point.date <= span.end),
    })),
    annotations: report.annotations.filter((note) => note.date >= span.start && note.date <= span.end),
  };
}

export const exampleReportSource: ReportMetricsSource = {
  id: "example",
  available: () => true,
  async load(query: ReportQuery) {
    const report = query.clientId === "all" ? allClients() : harbor();
    report.clientId = query.clientId === "all" ? "all" : "harbor";
    return applyQuery(report, query);
  },
};

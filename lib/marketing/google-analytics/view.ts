export type AnalyticsDailyInput = {
  date: string;
  campaign: string;
  source: string;
  medium: string;
  landingPage: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
};

export type AnalyticsTrafficRow = {
  campaign: string;
  source: string;
  medium: string;
  landingPage: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
};

export type AnalyticsLandingPage = {
  path: string;
  sessions: number;
  engagedSessions: number;
  conversions: number;
};

export type AnalyticsTrafficView = {
  sessions: number;
  engagedSessions: number;
  conversions: number;
  landingPages: AnalyticsLandingPage[];
  rows: AnalyticsTrafficRow[];
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function label(value: string) {
  const trimmed = value.trim();
  return trimmed || "Unassigned";
}

/** Rebuilds the dashboard block from traffic fields only. Spend and cost keys are dropped. */
export function analyticsForViewer(view: AnalyticsTrafficView): AnalyticsTrafficView {
  return {
    sessions: num(view.sessions),
    engagedSessions: num(view.engagedSessions),
    conversions: num(view.conversions),
    landingPages: (view.landingPages || []).map((row) => ({
      path: label(String(row.path || "")),
      sessions: num(row.sessions),
      engagedSessions: num(row.engagedSessions),
      conversions: num(row.conversions),
    })),
    rows: (view.rows || []).map((row) => ({
      campaign: label(String(row.campaign || "")),
      source: label(String(row.source || "")),
      medium: label(String(row.medium || "")),
      landingPage: label(String(row.landingPage || "")),
      sessions: num(row.sessions),
      engagedSessions: num(row.engagedSessions),
      conversions: num(row.conversions),
    })),
  };
}

export function presentAnalyticsTraffic(rows: readonly AnalyticsDailyInput[], from = ""): AnalyticsTrafficView {
  const kept = rows.filter((row) => !from || row.date >= from).filter((row) => row.sessions || row.engagedSessions || row.conversions);
  const grouped = new Map<string, AnalyticsTrafficRow>();
  const pages = new Map<string, AnalyticsLandingPage>();
  let sessions = 0;
  let engagedSessions = 0;
  let conversions = 0;
  for (const row of kept) {
    sessions += row.sessions;
    engagedSessions += row.engagedSessions;
    conversions += row.conversions;
    const campaign = label(row.campaign);
    const source = label(row.source);
    const medium = label(row.medium);
    const landingPage = label(row.landingPage);
    const key = [campaign, source, medium, landingPage].join("\u001f");
    const current = grouped.get(key) ?? { campaign, source, medium, landingPage, sessions: 0, engagedSessions: 0, conversions: 0 };
    current.sessions += row.sessions;
    current.engagedSessions += row.engagedSessions;
    current.conversions += row.conversions;
    grouped.set(key, current);
    const path = row.landingPage.trim();
    if (path && path !== "(not set)") {
      const page = pages.get(path) ?? { path, sessions: 0, engagedSessions: 0, conversions: 0 };
      page.sessions += row.sessions;
      page.engagedSessions += row.engagedSessions;
      page.conversions += row.conversions;
      pages.set(path, page);
    }
  }
  const ordered = [...grouped.values()].sort((a, b) => b.sessions - a.sessions || a.campaign.localeCompare(b.campaign));
  const landingPages = [...pages.values()].sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path)).slice(0, 8);
  return analyticsForViewer({
    sessions,
    engagedSessions,
    conversions,
    landingPages,
    rows: ordered.slice(0, 40),
  });
}

import { clarityHeatmapsUrl } from "./scope";

export type ClarityDailyInput = {
  date: string;
  clientId: string;
  projectId: string;
  breakdown: string;
  url: string;
  sessions: number;
  rageClicks: number;
  deadClicks: number;
  quickbacks: number;
  scrollDepth: number | null;
};

export type ClarityFrustrationPage = {
  url: string;
  projectId: string;
  sessions: number;
  rageClicks: number;
  deadClicks: number;
  quickbacks: number;
  scrollDepth: number | null;
};

export type ClarityFrustrationView = {
  projectIds: string[];
  clarityUrl: string;
  pages: ClarityFrustrationPage[];
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function depthOf(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Rebuilds the card from frustration fields only. Spend and cost keys are dropped. */
export function clarityForViewer(view: ClarityFrustrationView): ClarityFrustrationView {
  const pages = (view.pages || []).map((row) => {
    const projectId = String(row.projectId || "").trim();
    return {
      url: String(row.url || "").trim(),
      projectId: clarityHeatmapsUrl(projectId) ? projectId : "",
      sessions: num(row.sessions),
      rageClicks: num(row.rageClicks),
      deadClicks: num(row.deadClicks),
      quickbacks: num(row.quickbacks),
      scrollDepth: depthOf(row.scrollDepth),
    };
  }).filter((row) => row.url);
  const ids = [...new Set([...(view.projectIds || []).map((id) => String(id || "").trim()), ...pages.map((row) => row.projectId)].filter((id) => clarityHeatmapsUrl(id)))];
  return {
    projectIds: ids,
    clarityUrl: ids.length === 1 ? clarityHeatmapsUrl(ids[0] || "") : "",
    pages,
  };
}

function score(row: ClarityFrustrationPage) {
  return row.rageClicks + row.deadClicks + row.quickbacks;
}

/**
 * Top frustrated URLs for the selected range.
 * A client that has URL-only rows uses those, so a source breakdown is not added on top.
 */
export function presentClarityFrustration(rows: readonly ClarityDailyInput[], projectIds: readonly string[], from = ""): ClarityFrustrationView {
  const kept = rows.filter((row) => row.url.trim() && (!from || row.date >= from));
  const clientsWithPageRows = new Set(kept.filter((row) => row.breakdown === "url").map((row) => row.clientId));
  const used = kept.filter((row) => (clientsWithPageRows.has(row.clientId) ? row.breakdown === "url" : row.breakdown === "url_source_campaign"));
  const grouped = new Map<string, ClarityFrustrationPage & { weight: number; depth: number }>();
  for (const row of used) {
    const url = row.url.trim();
    const key = `${row.clientId}\u001f${url}`;
    const current = grouped.get(key) ?? {
      url,
      projectId: row.projectId,
      sessions: 0,
      rageClicks: 0,
      deadClicks: 0,
      quickbacks: 0,
      scrollDepth: null,
      weight: 0,
      depth: 0,
    };
    current.sessions += row.sessions;
    current.rageClicks += row.rageClicks;
    current.deadClicks += row.deadClicks;
    current.quickbacks += row.quickbacks;
    if (row.scrollDepth !== null && row.sessions > 0) {
      current.weight += row.sessions;
      current.depth += row.scrollDepth * row.sessions;
    }
    if (!current.projectId) current.projectId = row.projectId;
    grouped.set(key, current);
  }
  const pages = [...grouped.values()]
    .map((row) => ({
      url: row.url,
      projectId: row.projectId,
      sessions: row.sessions,
      rageClicks: row.rageClicks,
      deadClicks: row.deadClicks,
      quickbacks: row.quickbacks,
      scrollDepth: row.weight ? row.depth / row.weight : null,
    }))
    .filter((row) => score(row) > 0)
    .sort((a, b) => score(b) - score(a) || (a.scrollDepth ?? 101) - (b.scrollDepth ?? 101) || a.url.localeCompare(b.url))
    .slice(0, 8);
  return clarityForViewer({ projectIds: [...projectIds], clarityUrl: "", pages });
}

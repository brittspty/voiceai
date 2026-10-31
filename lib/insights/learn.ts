import { flagOn, type Env } from "../demo/flags";
import { omitForbiddenClientFields } from "../marketing/client-view";
import { stripForAudience } from "../marketing/channels/cost-strip";

/** Off unless INSIGHTS is explicitly on. */
export function insightsEnabled(env: Env = process.env) {
  return flagOn(env, "INSIGHTS");
}

export function insightsHttpStatus(input: { enabled: boolean; signedIn: boolean; kind: string | null; share: boolean }) {
  if (!input.enabled) return 404;
  if (input.share) return 403;
  if (!input.signedIn) return 401;
  if (input.kind !== "super_admin" && input.kind !== "account_manager") return 403;
  return 200;
}

export type InsightObservation = {
  vertical: string;
  source: string;
  creative: string;
  channel: string;
  qualified: number;
  leads: number;
  /** Anonymous client id. Never a business name. */
  clientKey: string;
};

export type InsightCard = {
  id: string;
  vertical: string;
  recommendation: string;
  reason: string;
  basedOn: string;
};

export const INSIGHT_RANGE = { start: "Sep 1, 2026", end: "Oct 31, 2026" };

/**
 * EXAMPLE DATA. Rows are anonymous. Names of businesses are not stored here.
 */
export const EXAMPLE_INSIGHT_OBSERVATIONS: InsightObservation[] = [
  { vertical: "Dental", source: "Google search ads", creative: "Short offer", channel: "Google Ads", qualified: 17, leads: 40, clientKey: "c1" },
  { vertical: "Dental", source: "Google search ads", creative: "Short offer", channel: "Google Ads", qualified: 9, leads: 22, clientKey: "c2" },
  { vertical: "Dental", source: "Lookalike list", creative: "Before and after", channel: "Display", qualified: 4, leads: 28, clientKey: "c1" },
  { vertical: "Dental", source: "Lookalike list", creative: "Before and after", channel: "Display", qualified: 3, leads: 19, clientKey: "c3" },
  { vertical: "Dental", source: "Website visitors", creative: "Short offer", channel: "Meta", qualified: 8, leads: 30, clientKey: "c2" },
  { vertical: "Home services", source: "Storm keyword list", creative: "15 second video", channel: "Google Ads", qualified: 14, leads: 26, clientKey: "c4" },
  { vertical: "Home services", source: "Storm keyword list", creative: "15 second video", channel: "Google Ads", qualified: 11, leads: 24, clientKey: "c5" },
  { vertical: "Home services", source: "Interest group", creative: "Static photo", channel: "Meta", qualified: 5, leads: 27, clientKey: "c4" },
  { vertical: "Home services", source: "Interest group", creative: "Static photo", channel: "Meta", qualified: 4, leads: 21, clientKey: "c6" },
  { vertical: "Home services", source: "Website visitors", creative: "15 second video", channel: "Display", qualified: 6, leads: 25, clientKey: "c5" },
];

type Tally = { name: string; qualified: number; leads: number };

function bestOf(rows: InsightObservation[], key: "source" | "creative" | "channel"): Tally | null {
  const groups = new Map<string, { qualified: number; leads: number }>();
  for (const row of rows) {
    const name = row[key];
    const current = groups.get(name) ?? { qualified: 0, leads: 0 };
    current.qualified += row.qualified;
    current.leads += row.leads;
    groups.set(name, current);
  }
  let winner: Tally | null = null;
  for (const [name, stat] of groups) {
    if (stat.leads < 5) continue;
    const rate = stat.qualified / stat.leads;
    const bestRate = winner ? winner.qualified / winner.leads : -1;
    if (!winner || rate > bestRate) winner = { name, qualified: stat.qualified, leads: stat.leads };
  }
  return winner;
}

function joinSources(sources: string[]) {
  const items = sources.filter(Boolean);
  if (items.length < 2) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function basedOnLine(input: { sources: string[]; start: string; end: string; n: number }) {
  return `Based on ${joinSources(input.sources)} · ${input.start}–${input.end} · n=${input.n}`;
}

/** Recommendations only. Client names are not copied onto the card. */
export function buildInsights(rows: InsightObservation[], range = INSIGHT_RANGE): InsightCard[] {
  const verticals = [...new Set(rows.map((row) => row.vertical))];
  const cards: InsightCard[] = [];
  for (const vertical of verticals) {
    const mine = rows.filter((row) => row.vertical === vertical);
    const channel = bestOf(mine, "channel");
    const creative = bestOf(mine, "creative");
    const source = bestOf(mine, "source");
    if (!channel || !creative || !source) continue;
    const n = new Set(mine.map((row) => row.clientKey)).size;
    const label = vertical.toLowerCase();
    cards.push({
      id: vertical.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      vertical,
      recommendation: `For ${label}, favor ${channel.name}, ${creative.name} creatives, and the ${source.name} audience.`,
      reason: `${channel.name} qualified ${channel.qualified} of ${channel.leads} leads in this set. ${creative.name} creatives qualified ${creative.qualified} of ${creative.leads}. The ${source.name} audience qualified ${source.qualified} of ${source.leads}. This is a recommendation only.`,
      basedOn: basedOnLine({
        sources: ["audience sources", "creatives", "channels"],
        start: range.start,
        end: range.end,
        n,
      }),
    });
  }
  return cards;
}

export function insightsPayload(rows: InsightObservation[] = EXAMPLE_INSIGHT_OBSERVATIONS) {
  const body = {
    label: "EXAMPLE DATA",
    recommendationsOnly: true,
    items: buildInsights(rows),
  };
  return omitForbiddenClientFields(stripForAudience(body, "staff"));
}

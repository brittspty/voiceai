export const DRIVERS = [
  "creative_fatigue",
  "budget_limited",
  "pacing",
  "audience_overlap",
  "landing_page",
  "tracking_gap",
  "search_term_shift",
  "seasonality",
  "review_change",
  "speed_to_lead",
  "normal_noise",
] as const;

export type Driver = (typeof DRIVERS)[number];

const PLAIN: Record<Driver, string> = {
  creative_fatigue: "its top ad got tired",
  budget_limited: "it ran out of budget",
  pacing: "it is spending ahead of plan",
  audience_overlap: "the audiences overlap",
  landing_page: "the landing page was down",
  tracking_gap: "tracking stopped",
  search_term_shift: "the search terms shifted",
  seasonality: "the season changed",
  review_change: "reviews changed",
  speed_to_lead: "speed to lead changed",
  normal_noise: "this is ordinary day-to-day noise",
};

export type Contributor = {
  name: string;
  delta: number;
  depth: number;
  driver: Driver;
};

export type Explanation = {
  text: string;
  showCause: boolean;
  confidence: number;
  band: "High" | "Medium" | null;
  driver: Driver | null;
  notCause: string | null;
};

export function confidenceBand(confidence: number): Explanation["band"] {
  if (confidence >= 80) return "High";
  if (confidence >= 60) return "Medium";
  return null;
}

export function notTheCauseLine(input: { pageUp: boolean; formOk: boolean; speedOk: boolean }) {
  if (input.pageUp && input.formOk && input.speedOk) return "Not the cause: the page is up, the form works, and speed to lead held.";
  return null;
}

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** One sentence. Below 60% confidence, no cause. */
export function explainChange(input: {
  metric: string;
  current: number;
  previous: number;
  period: string;
  contributors: Contributor[];
  confidence: number;
  campaignCount: number;
  pageUp?: boolean;
  formOk?: boolean;
  speedOk?: boolean;
}): Explanation {
  const band = confidenceBand(input.confidence);
  const notCause = notTheCauseLine({ pageUp: input.pageUp !== false, formOk: input.formOk !== false, speedOk: input.speedOk !== false });
  if (!band) {
    return { text: "Cause unclear, see breakdown.", showCause: false, confidence: input.confidence, band: null, driver: null, notCause };
  }
  const parentDelta = input.current - input.previous;
  const direction = parentDelta < 0 ? "down" : "up";
  const pct = input.previous ? Math.round((Math.abs(parentDelta) / Math.abs(input.previous)) * 100) : null;
  const change = pct == null ? `${Math.abs(parentDelta)}` : `${pct}%`;
  const ranked = input.contributors
    .map((row) => ({ ...row, share: parentDelta === 0 ? 0 : row.delta / parentDelta }))
    .filter((row) => row.share >= 0.5)
    .sort((a, b) => b.depth - a.depth || b.share - a.share);
  const winner = ranked[0];
  if (!winner) {
    const text = `Spread across ${input.campaignCount} campaigns; no single cause.`;
    return { text, showCause: false, confidence: input.confidence, band, driver: null, notCause };
  }
  const text = `${input.metric} ${direction} ${change} vs ${input.period}, mostly from ${winner.name} after ${PLAIN[winner.driver]}.`;
  return {
    text: words(text) > 28 ? `${input.metric} ${direction} ${change} vs ${input.period}, mostly from ${winner.name}.` : text,
    showCause: true,
    confidence: input.confidence,
    band,
    driver: winner.driver,
    notCause,
  };
}

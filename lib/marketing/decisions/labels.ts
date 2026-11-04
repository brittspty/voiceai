/** Readable decision copy. Dollars stay out of this helper unless the caller asks for them. */

export function formatPercent(rate: number | null) {
  if (rate === null || !Number.isFinite(rate)) return "n/a";
  const pct = rate * 100;
  const digits = pct >= 10 ? 1 : 2;
  const text = pct.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${text}%`;
}

export function formatDollars(amount: number | null) {
  if (amount === null || !Number.isFinite(amount)) return "n/a";
  return `$${amount.toFixed(2)}`;
}

/** Observed divided by the usual rate, such as 4.9x usual. */
export function formatMultiple(observed: number | null, baseline: number | null) {
  if (observed === null || baseline === null || !baseline || !Number.isFinite(observed) || !Number.isFinite(baseline)) return "";
  const ratio = observed / baseline;
  if (!Number.isFinite(ratio) || ratio <= 0) return "";
  const rounded = Math.round(ratio * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}x usual`;
}

export function metricTitle(input: {
  campaignName: string;
  adName: string;
  metric: string;
  observed: number | null;
  baseline: number | null;
  conversions: number;
  days: number;
  seesCost: boolean;
}) {
  const who = input.campaignName ? `${input.campaignName} – ${input.adName}` : input.adName;
  const multiple = formatMultiple(input.observed, input.baseline);
  const multipleBit = multiple ? `, ${multiple}` : "";
  const conversions = `${input.conversions} conversion${input.conversions === 1 ? "" : "s"}`;
  const days = `${input.days} day${input.days === 1 ? "" : "s"}`;
  const tail = `${conversions} in ${days}`;
  if (input.metric === "ctr") {
    return `${who}: click rate ${formatPercent(input.observed)} vs ${formatPercent(input.baseline)} usual${multipleBit}, ${tail}`;
  }
  if (input.metric === "cpc" || input.metric === "cpm") {
    const label = input.metric === "cpc" ? "cost per click" : "cost per thousand";
    if (!input.seesCost) return `${who}: ${label} ${multiple || "outside the usual range"}, ${tail}`;
    return `${who}: ${label} ${formatDollars(input.observed)} vs ${formatDollars(input.baseline)} usual${multipleBit}, ${tail}`;
  }
  return `${who}: ${input.metric} needs a look, ${tail}`;
}

/** No automated-traffic claim unless the click rate is 8% or more. */
export function rateSummary(input: { metric: string; ctr?: number | null; conversions: number }) {
  const ctr = input.ctr ?? null;
  if (input.conversions === 0 && ctr !== null && ctr >= 0.08) {
    return "Clicks came in without a conversion. The click rate is high enough that some of this traffic may be automated.";
  }
  if (input.conversions === 0 && input.metric === "ctr") {
    return "Clicks came in without a conversion. Check the landing page and who is seeing the ad.";
  }
  if (input.metric === "ctr") return "Click rate is outside the usual range. This is a note for a person to review.";
  return "This is outside the usual range. This is a note for a person to review.";
}

export function campaignAdsTitle(count: number, title: string) {
  if (count <= 1) return title;
  return `Campaign (${count} ads): ${title}`;
}

export function readableDecisionTitle(title: string) {
  const match = /^(\d+) ads:\s*/.exec(title);
  if (!match?.[1]) return title;
  return `Campaign (${match[1]} ads): ${title.slice(match[0].length)}`;
}

export function softenSummary(summary: string, ctr: number | null) {
  if (!/automated traffic/i.test(summary)) return summary;
  if (ctr !== null && ctr >= 0.08) return summary;
  return summary
    .replace(/That can be low-quality or automated traffic\.?/gi, "Check the landing page and who is seeing the ad.")
    .replace(/\s{2,}/g, " ")
    .trim();
}

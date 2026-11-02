import type { Env } from "../config";
import type { CtvLink, CtvLinkType, CtvMatchMethod } from "./types";

export const JASON_CLICK_DAYS = 7;
export const JASON_VIEW_DAYS = 1;
export const IP_LOOKBACK_DAYS = 30;
export const SENSITIVITY_VIEW_DAYS = [3, 7] as const;

const HOUR = 60 * 60 * 1000;

export function jasonWindows(env: Env = {}) {
  const clickRaw = (env.CTV_CLICK_DAYS ?? "").trim();
  const viewRaw = (env.CTV_VIEW_DAYS ?? "").trim();
  const click = clickRaw ? Number(clickRaw) : JASON_CLICK_DAYS;
  const view = viewRaw ? Number(viewRaw) : JASON_VIEW_DAYS;
  return {
    clickDays: Number.isFinite(click) && click > 0 ? Math.floor(click) : JASON_CLICK_DAYS,
    viewDays: Number.isFinite(view) && view >= 0 ? Math.floor(view) : JASON_VIEW_DAYS,
  };
}

export function windowLabel(clickDays: number, viewDays: number) {
  const click = clickDays === 1 ? "1-day click" : `${clickDays}-day click`;
  const view = viewDays === 1 ? "1-day view" : `${viewDays}-day view`;
  return `${click}, ${view}`;
}

export function lagHours(exposureTs: string, conversionTs: string) {
  const exposure = Date.parse(exposureTs);
  const conversion = Date.parse(conversionTs);
  if (!Number.isFinite(exposure) || !Number.isFinite(conversion)) return null;
  return (conversion - exposure) / HOUR;
}

export function insideHours(lag: number, days: number) {
  return lag >= 0 && lag <= days * 24;
}

export type CreditLink = CtvLink & { conversionId: string };

export type Credit = {
  conversionId: string;
  linkType: CtvLinkType;
  matchMethod: CtvMatchMethod;
  matchConfidence: number;
  lagHours: number;
  exposureEventId: string;
  probabilisticOnly: boolean;
};

function closest(links: CreditLink[]) {
  return [...links].sort((a, b) => a.lagHours - b.lagHours || a.exposureEventId.localeCompare(b.exposureEventId))[0] ?? null;
}

/**
 * Click wins. A conversion is click-through or view-through, never both.
 * The sensitivity windows are computed beside the default and do not replace it.
 */
export function creditConversions(links: CreditLink[], windows: { clickDays: number; viewDays: number }) {
  const byConversion = new Map<string, CreditLink[]>();
  for (const link of links) {
    const list = byConversion.get(link.conversionId) ?? [];
    list.push(link);
    byConversion.set(link.conversionId, list);
  }
  const counted = new Set<string>();
  const credits: Credit[] = [];
  for (const [conversionId, group] of byConversion) {
    const clicks = group.filter((link) => link.linkType === "click" && insideHours(link.lagHours, windows.clickDays));
    const views = group.filter((link) => link.linkType === "view" && insideHours(link.lagHours, windows.viewDays));
    const winner = closest(clicks) ?? closest(views);
    const inWindow = [...clicks, ...views];
    const probabilisticOnly = inWindow.length > 0 && inWindow.every((link) => link.matchMethod === "probabilistic");
    if (!winner) continue;
    const key = `${conversionId}:${winner.exposureEventId}:${winner.linkType}`;
    counted.add(key);
    credits.push({
      conversionId,
      linkType: winner.linkType,
      matchMethod: winner.matchMethod,
      matchConfidence: winner.matchConfidence,
      lagHours: winner.lagHours,
      exposureEventId: winner.exposureEventId,
      probabilisticOnly,
    });
  }
  const marked = links.map((link) => ({
    ...link,
    counted: counted.has(`${link.conversionId}:${link.exposureEventId}:${link.linkType}`),
  }));
  return { links: marked, credits };
}

export function sensitivityViewCounts(links: CreditLink[], clickDays: number) {
  const counts: Record<number, number> = {};
  for (const days of SENSITIVITY_VIEW_DAYS) {
    const credited = creditConversions(links, { clickDays, viewDays: days });
    counts[days] = credited.credits.filter((row) => row.linkType === "view" && !row.probabilisticOnly).length;
  }
  return counts;
}

export const LAG_BUCKETS = [
  { id: "0-1h", label: "Under 1 hour", max: 1 },
  { id: "1-6h", label: "1 to 6 hours", max: 6 },
  { id: "6-24h", label: "6 to 24 hours", max: 24 },
  { id: "1-3d", label: "1 to 3 days", max: 72 },
  { id: "3-7d", label: "3 to 7 days", max: 168 },
  { id: "7d+", label: "Over 7 days", max: Number.POSITIVE_INFINITY },
] as const;

export function lagBucket(hours: number) {
  let floor = 0;
  for (const bucket of LAG_BUCKETS) {
    if (hours >= floor && hours < bucket.max) return bucket;
    if (bucket.max === Number.POSITIVE_INFINITY) return bucket;
    floor = bucket.max;
  }
  return LAG_BUCKETS[LAG_BUCKETS.length - 1];
}

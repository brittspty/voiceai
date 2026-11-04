import { hasHumanDecision } from "./collapse";

/** Alert codes that duplicate a per-ad metric recommendation. */
export const FOLDABLE_RULES = new Set(["ctr_off", "cpc_off", "cpm_off", "ctr_without_results"]);

export type PairRow = {
  id: string;
  rule: string;
  metric: string;
  adId: string | null;
  windowStart: string;
  windowEnd: string;
  status: string;
  decidedById: string | null;
  decidedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  evidence: Record<string, unknown>;
};

function adIdsOf(row: PairRow) {
  const ids = new Set<string>();
  if (row.adId) ids.add(row.adId);
  const listed = row.evidence.adIds;
  if (Array.isArray(listed)) {
    for (const id of listed) if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

function sameWindow(a: PairRow, b: PairRow) {
  if (a.windowStart && b.windowStart && a.windowStart !== b.windowStart) return false;
  if (a.windowEnd && b.windowEnd && a.windowEnd !== b.windowEnd) return false;
  return true;
}

function stringIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && Boolean(id));
}

/**
 * One open item per ad, metric, and window.
 * ad_alert:* evidence is folded into the matching ctr_off, cpc_off, cpm_off, or ctr_without_results row.
 * Decided rows stay. Dry run is the default. Nothing is deleted.
 */
export function planDuplicatePairs(rows: readonly PairRow[], options: { apply?: boolean } = {}) {
  const archive: string[] = [];
  const updates: { id: string; evidence: Record<string, unknown> }[] = [];
  for (const alert of rows) {
    if (!alert.rule.startsWith("ad_alert:")) continue;
    const code = alert.rule.slice("ad_alert:".length);
    if (!FOLDABLE_RULES.has(code)) continue;
    const ids = adIdsOf(alert);
    const matches = rows.filter((row) => {
      if (row.id === alert.id || row.rule !== code) return false;
      if (!sameWindow(alert, row)) return false;
      if (ids.size && row.adId && !ids.has(row.adId)) return false;
      if (ids.size && !row.adId) return false;
      return true;
    });
    if (!matches.length) continue;
    const decidedAlert = hasHumanDecision(alert);
    if (!decidedAlert) archive.push(alert.id);
    for (const match of matches) {
      if (hasHumanDecision(match)) continue;
      const alertIds = new Set<string>([...stringIds(match.evidence.alertIds), ...stringIds(alert.evidence.alertIds), alert.id]);
      updates.push({
        id: match.id,
        evidence: {
          ...match.evidence,
          alertIds: [...alertIds],
          foldedFrom: `ad_alert:${code}`,
        },
      });
    }
  }
  return { archive, updates, dryRun: options.apply !== true, deletes: 0 };
}

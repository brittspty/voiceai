export type CollapseRow = {
  id: string;
  dedupeKey: string;
  createdAt: string;
  status: string;
  decidedById: string | null;
  decidedAt: string | null;
  snoozedUntil?: string | null;
};

const DECIDED = new Set(["accepted", "declined", "dismissed"]);

/** A person already acted. The collapse script keeps the row and never deletes it. */
export function hasHumanDecision(row: Pick<CollapseRow, "status" | "decidedById" | "decidedAt" | "snoozedUntil">) {
  if (row.decidedById || row.decidedAt || row.snoozedUntil) return true;
  return DECIDED.has(row.status);
}

/**
 * Keep the newest row for each key. Archive the other undecided copies.
 * Decided rows stay. Nothing is deleted. Dry run is the default.
 */
export function planCollapse(rows: readonly CollapseRow[], options: { apply?: boolean } = {}) {
  const groups = new Map<string, CollapseRow[]>();
  for (const row of rows) {
    if (!row.dedupeKey) continue;
    const list = groups.get(row.dedupeKey) ?? [];
    list.push(row);
    groups.set(row.dedupeKey, list);
  }
  const keep: string[] = [];
  const archive: string[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const newest = sorted[0];
    if (newest) keep.push(newest.id);
    for (const row of sorted.slice(1)) {
      if (hasHumanDecision(row)) keep.push(row.id);
      else archive.push(row.id);
    }
  }
  return { keep, archive, dryRun: options.apply !== true, deletes: 0 };
}

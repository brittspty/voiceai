export type OpenRecommendation = {
  id: string;
  dedupeKey: string;
  status: string;
  decidedById: string | null;
  decidedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  evidence?: unknown;
  lastSeenAt?: string | null;
};

export function isOpenRecommendation(row: OpenRecommendation) {
  if (!row.dedupeKey) return false;
  if (row.archivedAt) return false;
  if (row.decidedById || row.decidedAt) return false;
  return row.status === "draft" || row.status === "verified";
}

/** Newest open row for this key. A blank key never matches, so old rows stay put. */
export function selectOpenRecommendation(rows: readonly OpenRecommendation[], dedupeKey: string) {
  if (!dedupeKey) return null;
  const open = rows.filter((row) => row.dedupeKey === dedupeKey && isOpenRecommendation(row));
  open.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return open[0] ?? null;
}

export type UpsertDraft = {
  dedupeKey: string;
  evidence: unknown;
};

/**
 * Second pass updates the open row's evidence and lastSeenAt.
 * It does not insert another open row for the same key.
 */
export function applyUpsert<T extends OpenRecommendation>(rows: readonly T[], draft: UpsertDraft, now: string, create: (id: string) => T) {
  const open = selectOpenRecommendation(rows, draft.dedupeKey);
  if (open) {
    return {
      action: "update" as const,
      id: open.id,
      rows: rows.map((row) => (row.id === open.id ? { ...row, evidence: draft.evidence, lastSeenAt: now } : row)),
    };
  }
  const id = `new-${rows.length + 1}`;
  return { action: "insert" as const, id, rows: [...rows, create(id)] };
}

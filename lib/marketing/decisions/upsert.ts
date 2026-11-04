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

const CLOSED = new Set(["accepted", "resolved", "dismissed", "declined"]);

/** The newest closed row for this key, so a repeat issue can point back at it. */
export function earlierRecommendationId(rows: readonly OpenRecommendation[], dedupeKey: string) {
  if (!dedupeKey) return null;
  const closed = rows.filter((row) => row.dedupeKey === dedupeKey && !row.archivedAt && CLOSED.has(row.status));
  closed.sort((a, b) => (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt) || b.id.localeCompare(a.id));
  return closed[0]?.id ?? null;
}

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
  const created = create(id);
  const priorId = earlierRecommendationId(rows, draft.dedupeKey);
  const evidence = priorId && created.evidence && typeof created.evidence === "object" && !Array.isArray(created.evidence)
    ? { ...(created.evidence as Record<string, unknown>), priorRecommendationId: priorId }
    : created.evidence;
  return { action: "insert" as const, id, rows: [...rows, { ...created, evidence }] };
}

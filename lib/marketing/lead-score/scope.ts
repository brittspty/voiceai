/**
 * Who a lead-score read or mark is allowed to touch.
 * super_admin may pass every workspace. Everyone else is pinned to their own.
 */
export type LeadScope = { workspaceIds: "all" } | { workspaceIds: string[] };

export type ScopeActor = { role: string; kind: string; workspaceId?: string | null };

export function leadScopeFor(actor: ScopeActor): LeadScope {
  if (actor.kind === "super_admin" || actor.role === "super_admin") return { workspaceIds: "all" };
  const workspaceId = (actor.workspaceId || "").trim();
  if (!workspaceId) return { workspaceIds: [] };
  return { workspaceIds: [workspaceId] };
}

export function workspaceAllowed(workspaceId: string, scope: LeadScope) {
  if (!workspaceId) return false;
  if (scope.workspaceIds === "all") return true;
  return scope.workspaceIds.includes(workspaceId);
}

export function leadsSinceWhere(previousStart: Date, workspaceId: string) {
  return { workspaceId, createdAt: { gte: previousStart } };
}

export function listLeadWhere(scope: LeadScope): { workspaceId?: string | { in: string[] } } {
  if (scope.workspaceIds === "all") return {};
  if (scope.workspaceIds.length === 1) return { workspaceId: scope.workspaceIds[0] };
  return { workspaceId: { in: scope.workspaceIds } };
}

export function markLeadsWhere(ids: string[], scope: LeadScope) {
  const id = { in: ids };
  if (scope.workspaceIds === "all") return { id };
  if (scope.workspaceIds.length === 1) return { id, workspaceId: scope.workspaceIds[0] };
  return { id, workspaceId: { in: scope.workspaceIds } };
}

export function visibleScores<T extends { workspaceId: string }>(rows: T[], scope: LeadScope) {
  return rows.filter((row) => workspaceAllowed(row.workspaceId, scope));
}

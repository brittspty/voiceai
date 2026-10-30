import type { MarketingAccess } from "./access";
import { isolatedWhere } from "./workspace";

export type HomeScope =
  | { kind: "aggregate"; workspaceIds: string[] }
  | { kind: "one"; workspaceId: string }
  | { kind: "none" };

/** Super admins and account managers may roll up every client. Everyone else is one workspace. */
export function homeScope(input: {
  roleKind: MarketingAccess["kind"];
  workspaceId: string;
  requestedId: string | null;
  knownIds: readonly string[];
}): HomeScope {
  const known = [...new Set(input.knownIds.map((id) => id.trim()).filter(Boolean))];
  const own = input.workspaceId.trim();
  if (input.roleKind === "super_admin" || input.roleKind === "account_manager") {
    if (input.requestedId) {
      const requested = input.requestedId.trim();
      if (!requested || !known.includes(requested)) return { kind: "none" };
      return { kind: "one", workspaceId: requested };
    }
    return { kind: "aggregate", workspaceIds: known };
  }
  if (!own) return { kind: "none" };
  if (input.requestedId && input.requestedId.trim() !== own) return { kind: "none" };
  return { kind: "one", workspaceId: own };
}

export function scopeWorkspaceIds(scope: HomeScope): string[] {
  if (scope.kind === "none") return [];
  if (scope.kind === "one") return [scope.workspaceId];
  return scope.workspaceIds;
}

/**
 * One isolatedWhere per workspace. An empty list is refused so a rollup cannot fall open.
 * Each read stays on main's single-workspace helper.
 */
export function workspaceReads(workspaceIds: readonly string[]) {
  const ids = [...new Set(workspaceIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("A workspace is required.");
  return ids.map((id) => isolatedWhere(id));
}

/** Every marketing query for these features includes the caller's workspace. */
export function requireWorkspaceId(workspaceId: string) {
  const id = workspaceId.trim();
  if (!id) throw new Error("workspaceId is required");
  return id;
}

export function isolatedWhere<const T extends object>(workspaceId: string, where?: T): T & { workspaceId: string } {
  const id = requireWorkspaceId(workspaceId);
  const extra = (where ?? {}) as T & { workspaceId?: unknown };
  if (typeof extra.workspaceId === "string" && extra.workspaceId !== id) throw new Error("workspace mismatch");
  return { ...(where ?? ({} as T)), workspaceId: id };
}

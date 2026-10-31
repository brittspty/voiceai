import { workspaceReads } from "../marketing/isolation";
import { isolatedWhere } from "../marketing/workspace";

/** The prospect tenant. Real clients never use this id. */
export const DEMO_WORKSPACE_ID = "demo";

export function demoDeleteWhere() {
  return isolatedWhere(DEMO_WORKSPACE_ID);
}

export function assertDemoWorkspace(workspaceId: string) {
  const where = isolatedWhere(workspaceId);
  if (where.workspaceId !== DEMO_WORKSPACE_ID) throw new Error("demo mutations stay in the demo workspace");
  return where;
}

/**
 * Demo visitors only receive the demo workspace, even if a caller also names a real one.
 * Real visitors never receive the demo workspace.
 */
export function workspacesVisibleTo(kind: "demo" | "real", knownIds: readonly string[]) {
  if (kind === "demo") return workspaceReads([DEMO_WORKSPACE_ID]);
  const ids = knownIds.map((id) => id.trim()).filter((id) => id && id !== DEMO_WORKSPACE_ID);
  return workspaceReads(ids);
}

export function demoViewerGate(pathname: string): "allow" | "demo" {
  if (pathname.startsWith("/demo")) return "allow";
  if (pathname.startsWith("/api/demo")) return "allow";
  if (pathname === "/api/auth/logout") return "allow";
  if (pathname === "/contact" || pathname.startsWith("/contact/")) return "allow";
  if (pathname === "/privacy" || pathname === "/terms") return "allow";
  return "demo";
}

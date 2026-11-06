import { DEMO_WORKSPACE_ID } from "../../demo/isolation";
import { WORKSPACE_ID } from "../types";
import { isolatedWhere } from "../workspace";

/** One workspace per read. A caller cannot mix the demo tenant into a real query. */
export function prospectReadWhere<const T extends object>(workspaceId: string, where?: T) {
  return isolatedWhere(workspaceId, where);
}

/** Sync writes the deployment workspace only. Demo rows are never created here. */
export function assertProspectSyncWorkspace(workspaceId: string) {
  const where = isolatedWhere(workspaceId);
  if (where.workspaceId === DEMO_WORKSPACE_ID) throw new Error("prospect sync stays out of the demo workspace");
  if (where.workspaceId !== WORKSPACE_ID) throw new Error("prospect sync stays in the deployment workspace");
  return where;
}

export function prospectsInWorkspace<T extends { workspaceId: string; clientId: string }>(
  rows: readonly T[],
  workspaceId: string,
  clientId?: string,
) {
  const where = prospectReadWhere(workspaceId);
  return rows.filter((row) => row.workspaceId === where.workspaceId && (!clientId || row.clientId === clientId));
}

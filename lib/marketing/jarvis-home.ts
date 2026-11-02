import { EXAMPLE_ASSIGNMENTS, clientChannelPayload } from "./channels/catalog";
import { presentedVideoChannels } from "./channels/video-channels";
import { readScopedClient } from "./client-contract";
import type { Env } from "./config";
import { forSpendViewer } from "./spend-access";

export type SpendViewer = { kind: string; role?: string | null; workspaceId?: string | null };

/** Jarvis home JSON. Non-staff, including the all-clients viewer, never receive spend fields. */
export function jarvisHomeBody(input: { access: SpendViewer; requested?: string; env?: Env }) {
  const access = input.access;
  const requested = input.requested || "";
  const env = input.env;
  if (access.kind === "client_owner" || access.kind === "client_viewer") {
    const own = access.workspaceId || "harbor";
    const scoped = readScopedClient({
      kind: access.kind as "client_owner" | "client_viewer",
      ownClientId: own,
      assignedClientIds: [own],
      requestedClientId: requested || own,
      payload: {
        ...clientChannelPayload(),
        moreChannels: presentedVideoChannels("client", env),
        spend: 8300,
        budget: 100,
        cost: 12,
        cpl: 41,
        cpql: 124,
        roas: 3.2,
      },
    });
    if (!scoped.ok) return { status: scoped.status, body: { error: scoped.error } };
    return { status: 200, body: forSpendViewer(scoped.body, access, env) };
  }
  if (access.kind === "account_manager" && requested) {
    const scoped = readScopedClient({
      kind: "account_manager",
      ownClientId: access.workspaceId || "",
      assignedClientIds: EXAMPLE_ASSIGNMENTS.dana,
      requestedClientId: requested,
      payload: {
        qualified: 71,
        spend: 8300,
        cpl: 41,
        cpql: 124,
        roas: 3.2,
        leads: 212,
        moreChannels: presentedVideoChannels("staff", env),
      },
    });
    if (!scoped.ok) return { status: scoped.status, body: { error: scoped.error } };
    return { status: 200, body: forSpendViewer(scoped.body, access, env) };
  }
  return {
    status: 200,
    body: forSpendViewer(
      {
        qualified: 71,
        spend: 8300,
        cpl: 41,
        cpql: 124,
        roas: 3.2,
        leads: 212,
        moreChannels: presentedVideoChannels("staff", env),
      },
      access,
      env,
    ),
  };
}

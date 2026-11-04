import { decisionsV1Enabled, marketingClientSwitcherEnabled, type Env } from "../config";

const STAFF_KINDS = new Set(["super_admin", "account_manager", "all_clients_viewer", "staff"]);

export type DecisionSurface = "page" | "api" | "share" | "plan" | "export";

/** Off unless DECISIONS_V1 is explicitly on. The current /decisions screen stays in place. */
export function decisionsView(env: Env = process.env): "v1" | "empty" | "examples" {
  if (decisionsV1Enabled(env)) return "v1";
  if (marketingClientSwitcherEnabled(env)) return "empty";
  return "examples";
}

export function canSeeDecisions(kind: string | null | undefined) {
  return Boolean(kind && STAFF_KINDS.has(kind));
}

/**
 * Clients, client viewers, share links, plans, and exports get nothing.
 * The page uses this after the legacy branch, so a switched-off screen is unchanged.
 */
export function decisionsRequestStatus(input: {
  surface: DecisionSurface;
  enabled: boolean;
  signedIn: boolean;
  kind: string | null;
}) {
  if (input.surface === "share" || input.surface === "plan" || input.surface === "export") return 403;
  if (!input.enabled) return input.surface === "api" ? 404 : 200;
  if (!input.signedIn) return 401;
  if (!canSeeDecisions(input.kind)) return 403;
  return 200;
}

export function rejectsDecisionsRequest(url: URL) {
  if (url.pathname === "/decisions" || url.pathname.startsWith("/decisions/")) return true;
  if (url.pathname.includes("/api/marketing/decisions")) return true;
  if (url.searchParams.has("decisions")) return true;
  return false;
}

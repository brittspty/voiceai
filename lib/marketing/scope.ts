import type { MarketingAccess } from "./access";
import { isolatedWhere, requireWorkspaceId } from "./workspace";

type ScopeAccess = Pick<MarketingAccess, "workspaceId" | "accounts" | "campaigns" | "kind">;

/** Workspace first, then the caller's ad accounts or campaigns. The row limit belongs after this where. */
export function accessScopeWhere(access: ScopeAccess) {
  const workspaceId = requireWorkspaceId(access.workspaceId);
  if (access.kind === "super_admin" || access.kind === "staff" || access.accounts === "all") return isolatedWhere(workspaceId);
  if (access.campaigns !== "all") return isolatedWhere(workspaceId, { campaignId: { in: access.campaigns } });
  return isolatedWhere(workspaceId, { adAccountId: { in: access.accounts } });
}

/** Recommendations have no workspace column, so the campaign row carries it. */
export function recommendationScopeWhere(access: ScopeAccess, extra: Record<string, unknown> = {}) {
  const scope = accessScopeWhere(access);
  const { workspaceId, ...rest } = scope;
  return { ...extra, ...rest, campaign: { workspaceId } };
}

export function clientMetricWhere(workspaceId: string, adAccountIds: "all" | string[], start: Date, end: Date) {
  const id = requireWorkspaceId(workspaceId);
  const date = { gte: start, lte: end };
  if (adAccountIds === "all") return isolatedWhere(id, { date });
  return isolatedWhere(id, {
    date,
    campaign: { workspaceId: id, adAccountId: { in: adAccountIds } },
  });
}

/**
 * A queued variation counts only when its creative is already running in this workspace and,
 * when the caller is limited to accounts, in one of those accounts.
 */
export function queuedTestingWhere(workspaceId: string, adAccountIds: "all" | string[]) {
  const id = requireWorkspaceId(workspaceId);
  const campaign = adAccountIds === "all" ? { workspaceId: id } : { workspaceId: id, adAccountId: { in: adAccountIds } };
  return isolatedWhere(id, {
    status: "queued" as const,
    creative: {
      workspaceId: id,
      versions: {
        some: {
          ads: {
            some: {
              workspaceId: id,
              adGroup: { campaign },
            },
          },
        },
      },
    },
  });
}

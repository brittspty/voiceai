import type { MarketingAccess } from "./access";
import { coversAccount, coversCampaign } from "./access";
import { isolatedWhere } from "./workspace";

export function featureHttpStatus(input: { enabled: boolean; allowed: boolean }): 404 | 403 | 200 {
  if (!input.enabled) return 404;
  if (!input.allowed) return 403;
  return 200;
}

export function canReviewSearchWaste(access: MarketingAccess) {
  if (!access.workspaceId) return false;
  if (access.kind === "super_admin") return true;
  if (access.kind !== "account_manager") return false;
  return access.accounts === "all" || access.accounts.length > 0 || access.campaigns === "all" || access.campaigns.length > 0;
}

export function canWatchCompetitors(access: MarketingAccess) {
  if (!access.workspaceId) return false;
  if (access.kind === "super_admin" || access.kind === "client_owner") return true;
  if (access.kind === "account_manager") {
    return access.accounts === "all" || access.accounts.length > 0 || access.campaigns === "all" || access.campaigns.length > 0;
  }
  return access.kind === "staff" && access.seesAlerts;
}

export function canViewHoldouts(access: MarketingAccess) {
  return canWatchCompetitors(access);
}

export function accountFilter(access: MarketingAccess): "all" | string[] {
  if (access.accounts === "all") return "all";
  return access.accounts;
}

export function campaignAllowed(access: MarketingAccess, input: { adAccountId: string; campaignId?: string; id?: string }) {
  const campaignId = input.campaignId || input.id || "";
  if (access.kind === "super_admin" || access.kind === "staff") return coversAccount(access, input.adAccountId);
  return coversCampaign(access, { adAccountId: input.adAccountId, campaignId });
}

export function holdoutListWhere(access: MarketingAccess) {
  if (access.kind === "super_admin" || access.kind === "staff" || access.kind === "client_owner" || access.accounts === "all") return isolatedWhere(access.workspaceId);
  if (access.campaigns !== "all") return isolatedWhere(access.workspaceId, { campaignId: { in: access.campaigns } });
  return isolatedWhere(access.workspaceId, { adAccountId: { in: access.accounts } });
}

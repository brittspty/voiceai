import type { Prisma } from "@prisma/client";
import { requireWorkspaceId } from "./workspace";

/**
 * A campaign the client may see.
 * Campaign.clientId wins. Otherwise an ad account mapped to the client, or a workspace row that is not claimed by another client.
 * A campaign assigned to someone else never leaks out of a shared ad account.
 */
export type CampaignScopeRow = {
  workspaceId: string;
  clientId: string | null;
  accountClientId: string | null;
};

export function campaignVisibleToClient(row: CampaignScopeRow, clientId: string) {
  const id = clientId.trim();
  if (!id) return false;
  if (row.clientId === id) return true;
  if (row.clientId) return false;
  if (row.accountClientId === id) return true;
  return row.workspaceId === id && !row.accountClientId;
}

export function metricVisibleToClient(row: CampaignScopeRow & { campaignId: string | null }, clientId: string) {
  if (!row.campaignId) return row.workspaceId === clientId.trim();
  return campaignVisibleToClient(row, clientId);
}

/** Campaigns, their ad sets, their ads, and their metric rows. */
export function scopeClientRecords<T extends CampaignScopeRow & { adGroups?: { id: string; ads?: { id: string }[] }[]; rows?: { id: string }[] }>(
  clientId: string,
  rows: T[],
) {
  return rows.filter((row) => campaignVisibleToClient(row, clientId));
}

export function clientOwnsCampaignFilter(scopeId: string): Prisma.CampaignWhereInput {
  const id = requireWorkspaceId(scopeId);
  return {
    OR: [
      { clientId: id },
      { clientId: null, adAccount: { clientId: id } },
      { workspaceId: id, clientId: null, adAccount: { clientId: null } },
    ],
  };
}

/** Metric and plan rows. A row with no campaign stays on its own workspace. */
export function clientScopeWhere(scopeId: string): Prisma.DailyMetricWhereInput {
  const id = requireWorkspaceId(scopeId);
  return {
    OR: [
      { campaign: { clientId: id } },
      { campaign: { clientId: null, adAccount: { clientId: id } } },
      {
        workspaceId: id,
        OR: [{ campaignId: null }, { campaign: { clientId: null, adAccount: { clientId: null } } }],
      },
    ],
  };
}

export function clientSurfaceCampaignWhere(input: {
  scopeId: string;
  platforms: readonly string[];
  campaignIds?: "all" | readonly string[];
  adAccountIds?: "all" | readonly string[];
}): Prisma.CampaignWhereInput {
  if (!input.platforms.length) throw new Error("A platform is required.");
  const id = requireWorkspaceId(input.scopeId);
  const and: Prisma.CampaignWhereInput[] = [
    clientOwnsCampaignFilter(id),
    { platform: { in: [...input.platforms] as ("meta" | "google_ads" | "tiktok" | "linkedin" | "stackadapt")[] } },
    { status: { notIn: ["archived", "deleted"] } },
  ];
  if (input.campaignIds && input.campaignIds !== "all") {
    and.push({ id: { in: [...input.campaignIds] } });
  } else if (input.adAccountIds && input.adAccountIds !== "all") {
    and.push({ adAccountId: { in: [...input.adAccountIds] } });
  }
  return { AND: and };
}

export function clientSurfaceMetricWhere(
  scopeId: string,
  adAccountIds: "all" | readonly string[],
  start: Date,
  end: Date,
): Prisma.DailyMetricWhereInput {
  const id = requireWorkspaceId(scopeId);
  const and: Prisma.DailyMetricWhereInput[] = [clientScopeWhere(id), { date: { gte: start, lte: end } }];
  if (adAccountIds !== "all") and.push({ campaign: { adAccountId: { in: [...adAccountIds] } } });
  return { AND: and };
}

export function clientSurfaceTestingWhere(scopeId: string, adAccountIds: "all" | readonly string[]): Prisma.CreativeVersionWhereInput {
  const id = requireWorkspaceId(scopeId);
  const and: Prisma.CampaignWhereInput[] = [clientOwnsCampaignFilter(id)];
  if (adAccountIds !== "all") and.push({ adAccountId: { in: [...adAccountIds] } });
  return {
    status: "queued",
    creative: {
      versions: {
        some: {
          ads: {
            some: {
              adGroup: { campaign: { AND: and } },
            },
          },
        },
      },
    },
  };
}

/** Report and share rows. "all" is the staff rollup and is not a client id. */
export function scopeReportCampaigns<T extends CampaignScopeRow>(clientId: string, rows: T[]) {
  const id = clientId.trim();
  if (!id || id === "all") return rows;
  return scopeClientRecords(id, rows);
}

import { prisma } from "../../db";
import { REPORT_COST_TEXT } from "../client-view";
import { clientSurfaceCampaignWhere, scopeReportCampaigns } from "../client-read-scope";

const PLATFORMS = ["meta", "google_ads", "tiktok", "linkedin", "stackadapt"] as const;

/** Live campaigns, ad sets, and ads for one client. Spend fields are not selected. */
export async function campaignsForReport(clientId: string) {
  const id = clientId.trim();
  if (!id || id === "all") return [];
  const rows = await prisma.campaign.findMany({
    where: clientSurfaceCampaignWhere({ scopeId: id, platforms: PLATFORMS }),
    select: {
      id: true,
      name: true,
      workspaceId: true,
      clientId: true,
      adAccount: { select: { clientId: true } },
      adGroups: { select: { id: true, ads: { select: { id: true } } } },
    },
  });
  return scopeReportCampaigns(
    id,
    rows.map((row) => ({
      ...row,
      accountClientId: row.adAccount.clientId,
    })),
  );
}

export function campaignNamesForReport(rows: { name: string }[]) {
  return rows.map((row) => row.name.trim()).filter((name) => name && !REPORT_COST_TEXT.test(name));
}

/** Example reports stay as written. A live client report is labeled with that client's campaigns only. */
export function applyLiveCampaignScope<T extends { exampleData: boolean; audience: string; scopeLabel: string }>(report: T, names: string[]): T {
  if (report.exampleData || report.audience !== "client" || names.length === 0) return report;
  return { ...report, scopeLabel: names.join(", ") };
}

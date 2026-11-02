import { clientMetricVisibilityEnabled, reportsV2Enabled } from "../config";
import { filterClientReport } from "../metric-visibility";
import { loadResolvedVisibility } from "../metric-visibility-store";
import { loadMarketingAccess } from "../queries";
import { applyLiveCampaignScope, campaignNamesForReport, campaignsForReport } from "./campaign-scope";
import { loadStaffReport, reportForRequester } from "./load";
import { parseReportQuery } from "./query";
import type { ClientReport, StaffReport } from "./types";

export async function buildReport(
  user: { id: string; email: string; role: string },
  search: Record<string, string | string[] | undefined>,
): Promise<{
  report: StaffReport | ClientReport;
  seesCost: boolean;
  canShare: boolean;
  canStaffPdf: boolean;
  pdfDefault: "staff" | "client";
  kind: string;
} | null> {
  if (!reportsV2Enabled()) return null;
  const access = await loadMarketingAccess(user);
  const parsed = parseReportQuery(search);
  const seesCost = access.seesCost;
  const view = seesCost && parsed.view === "staff" ? "staff" : "client";
  const ownClient = access.kind === "client_viewer" || access.kind === "client_owner" ? access.workspaceId : "";
  const clientId = !seesCost && (parsed.clientId === "all" || !parsed.clientId) ? ownClient || "harbor" : parsed.clientId;
  const staff = await loadStaffReport({
    range: parsed.range,
    compare: parsed.compare,
    clientId,
    start: parsed.start,
    end: parsed.end,
  });
  let report = reportForRequester(staff, { seesCost, view });
  if (view === "client") {
    const names = campaignNamesForReport(await campaignsForReport(clientId));
    report = applyLiveCampaignScope(report, names);
  }
  if (clientMetricVisibilityEnabled() && "audience" in report && report.audience === "client") {
    const reportClientId = report.clientId && report.clientId !== "all" ? report.clientId : "";
    if (reportClientId) report = filterClientReport(report, await loadResolvedVisibility(reportClientId));
  }
  return {
    report,
    seesCost,
    canShare: access.canCreateShareLink,
    canStaffPdf: seesCost,
    pdfDefault: access.kind === "account_manager" || !seesCost ? "client" : view,
    kind: access.kind,
  };
}

import { reportsV2Enabled } from "../config";
import { loadMarketingAccess } from "../queries";
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
  const clientId = !seesCost && (parsed.clientId === "all" || !parsed.clientId) ? "harbor" : parsed.clientId;
  const staff = await loadStaffReport({
    range: parsed.range,
    compare: parsed.compare,
    clientId,
    start: parsed.start,
    end: parsed.end,
  });
  return {
    report: reportForRequester(staff, { seesCost, view }),
    seesCost,
    canShare: access.canCreateShareLink,
    canStaffPdf: seesCost,
    pdfDefault: access.kind === "account_manager" || !seesCost ? "client" : view,
    kind: access.kind,
  };
}

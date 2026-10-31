import { sealClientReport } from "../client-view";
import { channelRegistryEnabled } from "../config";
import { overlayStaffReport } from "../channels/registry";
import { REPORT_MOTION } from "./motion";
import { selectReportSource } from "./source";
import type { ClientReport, ReportQuery, StaffReport } from "./types";

const cache = new Map<string, { at: number; report: StaffReport }>();

export function clearReportCache() {
  cache.clear();
}

export async function loadStaffReport(query: ReportQuery, now = Date.now()): Promise<StaffReport> {
  const source = await selectReportSource();
  const key = `${source.id}:${channelRegistryEnabled() ? "registry" : "base"}:${JSON.stringify(query)}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < REPORT_MOTION.cacheMs) return hit.report;
  let report = await source.load(query);
  report.sourceId = source.id;
  if (channelRegistryEnabled()) report = overlayStaffReport(report);
  cache.set(key, { at: now, report });
  return report;
}

export function reportForRequester(staff: StaffReport, input: { seesCost: boolean; view: "staff" | "client" }): StaffReport | ClientReport {
  if (!input.seesCost || input.view === "client") return sealClientReport(staff);
  return staff;
}

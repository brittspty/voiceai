import { sealClientReport } from "../client-view";
import { channelRegistryEnabled, reportsP1Enabled } from "../config";
import { overlayStaffReport } from "../channels/registry";
import { WORKSPACE_ID } from "../types";
import { REPORT_MOTION } from "./motion";
import { notesForReport, withUserAnnotations } from "./p1/annotations";
import { selectReportSource } from "./source";
import type { ReportAnnotation, ClientReport, ReportQuery, StaffReport } from "./types";

const cache = new Map<string, { at: number; report: StaffReport }>();

export function clearReportCache() {
  cache.clear();
}

async function defaultReadNotes() {
  const { p1LogStore } = await import("../p1-log-prisma");
  return p1LogStore.listNotes(WORKSPACE_ID);
}

export async function loadStaffReport(
  query: ReportQuery,
  now = Date.now(),
  readNotes?: () => Promise<ReportAnnotation[]>,
): Promise<StaffReport> {
  const source = await selectReportSource();
  const key = `${source.id}:${channelRegistryEnabled() ? "registry" : "base"}:${JSON.stringify(query)}`;
  const enabled = reportsP1Enabled();
  const added = await notesForReport(enabled, readNotes ?? defaultReadNotes);
  const hit = cache.get(key);
  if (hit && now - hit.at < REPORT_MOTION.cacheMs) return withUserAnnotations(hit.report, added, enabled);
  let report = await source.load(query);
  report.sourceId = source.id;
  if (channelRegistryEnabled()) report = overlayStaffReport(report);
  cache.set(key, { at: now, report });
  return withUserAnnotations(report, added, enabled);
}

export function reportForRequester(staff: StaffReport, input: { seesCost: boolean; view: "staff" | "client" }): StaffReport | ClientReport {
  if (!input.seesCost || input.view === "client") return sealClientReport(staff);
  return staff;
}

import { sealClientReport, reopenClientReport } from "../../client-view";
import { forReader } from "../../p1-reader";
import { loadStaffReport } from "../load";
import type { ReportQuery, ReportRange, ReportCompare } from "../types";

export function captureMode(input: { enabled: boolean; keepLive: boolean }): "snapshot" | "live" {
  if (!input.enabled) return "snapshot";
  return input.keepLive ? "live" : "snapshot";
}

export function liveShareMarker(query: Pick<ReportQuery, "range" | "compare" | "clientId" | "start" | "end">) {
  return {
    reportsP1Live: true as const,
    exampleData: true as const,
    range: query.range,
    compare: query.compare,
    clientId: query.clientId || "all",
    ...(query.start ? { start: query.start } : {}),
    ...(query.end ? { end: query.end } : {}),
  };
}

type LiveMarker = {
  reportsP1Live: true;
  exampleData: true;
  range: ReportRange;
  compare: ReportCompare;
  clientId: string;
  start?: string;
  end?: string;
};

export function isLiveShareMarker(value: unknown): value is LiveMarker {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LiveMarker>;
  return row.reportsP1Live === true && typeof row.range === "string" && typeof row.compare === "string" && typeof row.clientId === "string";
}

/** Snapshot stays the default. Keep live is stored only while Reports P1 is on. */
export function shareBody(input: { enabled: boolean; keepLive: boolean; sealed: unknown; query: ReportQuery }) {
  if (captureMode(input) === "live") return liveShareMarker(input.query);
  return input.sealed;
}

export function sealShareReport(staff: Parameters<typeof sealClientReport>[0]) {
  return forReader(sealClientReport(staff), "share");
}

/** A live link rebuilds the current client report. A snapshot reopens the frozen copy. */
export async function materializeShare(snapshot: unknown, enabled: boolean, load: typeof loadStaffReport = loadStaffReport) {
  if (enabled && isLiveShareMarker(snapshot)) {
    const staff = await load({
      range: snapshot.range,
      compare: snapshot.compare,
      clientId: snapshot.clientId,
      start: snapshot.start,
      end: snapshot.end,
    });
    return sealShareReport(staff);
  }
  return reopenClientReport(snapshot);
}

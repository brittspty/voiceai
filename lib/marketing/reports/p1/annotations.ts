import type { P1LogStore } from "../../p1-log-store";
import type { ReportAnnotation, StaffReport } from "../types";

const notes: ReportAnnotation[] = [];

export function resetChartAnnotations() {
  notes.length = 0;
}

export function listChartAnnotations(): ReportAnnotation[] {
  return notes.map((note) => ({ ...note }));
}

function clientSafeNote(body: string) {
  if (/spend|cost|cpc|cpm|cpa|cpl|budget|roas|revenue|\$/i.test(body)) return "A note was added to this chart.";
  return body;
}

export function buildChartAnnotation(input: {
  seriesId: string;
  date: string;
  body: string;
  authorName: string;
  loggedAt: string;
}): ReportAnnotation | { error: string } {
  const body = input.body.trim();
  const authorName = input.authorName.trim();
  if (!body || body.length > 240) return { error: "Write a short note." };
  if (!authorName) return { error: "A staff name is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Use a date." };
  if (!/^[a-z0-9-]{1,40}$/.test(input.seriesId)) return { error: "Pick a chart." };
  return {
    date: input.date,
    seriesId: input.seriesId,
    label: input.date,
    body,
    clientBody: clientSafeNote(body),
    authorName,
    loggedAt: input.loggedAt,
  };
}

/** Staff-only. Records who added the note and when. */
export function addChartAnnotation(input: { seriesId: string; date: string; body: string; authorName: string; loggedAt: string }): ReportAnnotation | { error: string } {
  const note = buildChartAnnotation(input);
  if ("error" in note) return note;
  notes.push(note);
  return { ...note };
}

/** Writes the staff note to the store. A restart reads it back from the same rows. */
export async function saveChartAnnotation(
  store: P1LogStore,
  workspaceId: string,
  input: { seriesId: string; date: string; body: string; authorName: string; loggedAt: string },
): Promise<ReportAnnotation | { error: string }> {
  const note = buildChartAnnotation(input);
  if ("error" in note) return note;
  await store.insertNote(workspaceId, note);
  return { ...note };
}

/** Skips the store when Reports P1 is off so the report path stays the same. */
export async function notesForReport(enabled: boolean, read: () => Promise<ReportAnnotation[]>) {
  if (!enabled) return [];
  return read();
}

/** Leaves the report untouched when P1 is off or nobody has added a note. */
export function withUserAnnotations<T extends StaffReport>(report: T, added: ReportAnnotation[], enabled: boolean): T {
  if (!enabled || added.length === 0) return report;
  return { ...report, annotations: [...report.annotations, ...added] };
}

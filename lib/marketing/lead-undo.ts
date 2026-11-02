import { canMarkLead } from "./channels/speed";

/** Same 30 second window as a recommendation undo in human-actions. */
export const LEAD_UNDO_MS = 30_000;

export type LeadUndoEntry = {
  leadId: string;
  actorId: string;
  previous: boolean | null;
  qualified: boolean;
  at: number;
};

const log: LeadUndoEntry[] = [];

export function leadUndoEntries() {
  return log.map((entry) => ({ ...entry }));
}

export function recordLeadMark(input: {
  role: string;
  actorId: string;
  leadId: string;
  qualified: boolean;
  previous: boolean | null;
  now?: number;
}) {
  if (!canMarkLead(input.role)) {
    return { ok: false as const, reason: "Viewers can see the result and cannot mark a lead." };
  }
  const at = input.now ?? Date.now();
  const entry: LeadUndoEntry = {
    leadId: input.leadId,
    actorId: input.actorId,
    previous: input.previous,
    qualified: input.qualified,
    at,
  };
  log.push(entry);
  return { ok: true as const, undoMs: LEAD_UNDO_MS, at, entry };
}

export function undoLoggedLead(input: { role: string; actorId: string; leadId: string; now?: number }) {
  if (!canMarkLead(input.role)) {
    return { ok: false as const, reason: "Viewers can see the result and cannot mark a lead." };
  }
  const now = input.now ?? Date.now();
  const entry = [...log].reverse().find((row) => row.leadId === input.leadId && row.actorId === input.actorId);
  if (!entry) return { ok: false as const, reason: "Nothing to undo." };
  if (now - entry.at > LEAD_UNDO_MS) return { ok: false as const, reason: "The undo window has closed." };
  return { ok: true as const, previous: entry.previous, qualified: entry.previous, undoMs: LEAD_UNDO_MS };
}

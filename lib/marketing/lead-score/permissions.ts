import type { LeadLabel, LeadMarkName } from "./types";

const STAFF_MARKS: LeadMarkName[] = ["qualified", "unqualified", "spam", "clear"];
const OWNER_MARKS: LeadMarkName[] = ["qualified", "unqualified", "clear"];

export type MarkActor = { role: string; kind: string };

/**
 * `client_owner` is the client who owns this workspace. The internal admin and
 * viewer roles are not that person. super_admin and account_manager are staff
 * and do not use the client-owner path.
 */
export function isClientOwner(actor: MarkActor) {
  return actor.kind === "client_owner";
}

/** Client owner, super admin, and account manager can mark. Everyone else is read-only. */
export function canMarkLead(actor: MarkActor) {
  if (isStaffMarker(actor)) return true;
  return isClientOwner(actor);
}

export function isStaffMarker(actor: MarkActor) {
  return actor.kind === "super_admin" || actor.kind === "account_manager" || actor.role === "super_admin" || actor.role === "account_manager";
}

export function allowedLeadMarks(actor: MarkActor): LeadMarkName[] {
  if (!canMarkLead(actor)) return [];
  if (isStaffMarker(actor)) return STAFF_MARKS;
  if (isClientOwner(actor)) return OWNER_MARKS;
  return [];
}

export function decideLeadMark(actor: MarkActor, mark: string): { ok: true; label: LeadLabel | null } | { ok: false } {
  const allowed = allowedLeadMarks(actor);
  if (!allowed.includes(mark as LeadMarkName)) return { ok: false };
  if (mark === "clear") return { ok: true, label: null };
  return { ok: true, label: mark as LeadLabel };
}

export function markAudience(actor: MarkActor): "owner" | "staff" | "readonly" {
  if (!canMarkLead(actor)) return "readonly";
  if (isStaffMarker(actor)) return "staff";
  return "owner";
}

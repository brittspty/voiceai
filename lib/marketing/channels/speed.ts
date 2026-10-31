export const SPEED_GOAL_SEC = 30;

/** Clock starts at landing. If landing time is missing, it starts at form submit and is marked. */
export function measureSpeed(input: { landedAt?: string | null; submittedAt?: string | null; contactedAt: string }) {
  const fromLanding = Boolean(input.landedAt);
  const start = input.landedAt || input.submittedAt;
  if (!start) return null;
  const seconds = Math.round((Date.parse(input.contactedAt) - Date.parse(start)) / 1000);
  if (!Number.isFinite(seconds)) return null;
  return {
    seconds,
    goal: SPEED_GOAL_SEC,
    from: fromLanding ? ("landing" as const) : ("form_submit" as const),
    footnote: fromLanding ? "" : "Clock started at form submit because landing time was missing.",
    label: fromLanding ? `${seconds}s` : `${seconds}s*`,
    overGoal: seconds > SPEED_GOAL_SEC,
  };
}

export function canMarkLead(role: string) {
  return role === "client_owner" || role === "owner" || role === "super_admin" || role === "account_manager" || role === "admin";
}

export function markLead(input: { role: string; leadId: string; qualified: boolean; actorName: string; at: string }) {
  if (!canMarkLead(input.role)) return { ok: false as const, reason: "Viewers can see the result and cannot mark a lead." };
  return {
    ok: true as const,
    leadId: input.leadId,
    qualified: input.qualified,
    actorName: input.actorName,
    at: input.at,
    undoMs: 30_000,
  };
}

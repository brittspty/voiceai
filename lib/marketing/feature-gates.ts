/** Pacing is spend math. Only a super admin or account manager who can see cost may read it. */
export function pacingAccessStatus(access: { kind: string; seesCost: boolean } | null): 401 | 403 | 200 {
  if (!access) return 401;
  if ((access.kind !== "super_admin" && access.kind !== "account_manager") || !access.seesCost) return 403;
  return 200;
}

/** Creative-fatigue cards are staff alerts. Client roles and signed-out visitors get 403. */
export function fatigueAccessStatus(access: { kind: string; seesAlerts: boolean } | null): 401 | 403 | 200 {
  if (!access) return 401;
  if (access.kind === "client_viewer" || access.kind === "none" || !access.seesAlerts) return 403;
  return 200;
}

/** Share links never receive spend, CPA, or pacing. */
export function shareLinkSeesCost() {
  return false;
}

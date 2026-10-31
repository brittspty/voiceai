export type Env = Record<string, string | undefined>;

/** Off unless AIS2L_COMPLIANCE_V2 is explicitly on. Voice mode is a separate switch. */
export function ais2lComplianceV2Enabled(env: Env = process.env) {
  const value = (env.AIS2L_COMPLIANCE_V2 || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function callReason(env: Env = process.env) {
  const value = (env.AIS2L_CALL_REASON || "").trim();
  return value || "you asked for a short introduction";
}

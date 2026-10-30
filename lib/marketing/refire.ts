export type Severity = "info" | "warning" | "critical";

export function readSeverity(evidence: unknown): Severity {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "warning";
  const value = (evidence as { severity?: unknown }).severity;
  if (value === "info" || value === "warning" || value === "critical") return value;
  return "warning";
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/** One alert per key per cooldown. A higher severity can fire again inside the window. */
export function shouldRefire(input: {
  previous: { severity: Severity; at: string } | null;
  next: Severity;
  now: string;
  cooldownDays: number;
}) {
  if (!input.previous) return true;
  const elapsed = Date.parse(input.now) - Date.parse(input.previous.at);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= input.cooldownDays * 86_400_000) return true;
  return RANK[input.next] > RANK[input.previous.severity];
}

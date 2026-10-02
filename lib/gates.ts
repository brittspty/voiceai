import type { CallingPolicy, ConsentLevel, GateCheckView } from "./types";
import { withinWindow, zonedParts, formatHHMM, parseHHMM, weekdayName } from "./time";

const RANK: Record<ConsentLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

export type GateInput = {
  now: Date;
  timeZone: string;
  consent: ConsentLevel | null;
  onDoNotCall: boolean;
  dialsToday: number;
  attemptsForContact: number;
  policy: CallingPolicy;
};

export function consentMeets(consent: ConsentLevel | null, minimum: ConsentLevel) {
  return RANK[consent ?? "none"] >= RANK[minimum] && (consent ?? "none") !== "none";
}

export function evaluateGates(input: GateInput): { passed: boolean; checks: GateCheckView[] } {
  const { policy } = input;
  const checks: GateCheckView[] = [];

  if (policy.requireConsent) {
    const ok = consentMeets(input.consent, policy.minConsent);
    checks.push({
      id: "consent",
      label: "Consent",
      passed: ok,
      detail: ok
        ? `Consent is ${input.consent}, which meets the ${policy.minConsent} minimum.`
        : "No usable consent is on file for this number.",
    });
  } else {
    checks.push({
      id: "consent",
      label: "Consent",
      passed: true,
      detail: "Consent is not required by the published rules.",
    });
  }

  if (policy.enforceDnc) {
    checks.push({
      id: "dnc",
      label: "Do-not-call",
      passed: !input.onDoNotCall,
      detail: input.onDoNotCall
        ? "This number is on the active do-not-call list."
        : "This number is not on the do-not-call list.",
    });
  } else {
    checks.push({
      id: "dnc",
      label: "Do-not-call",
      passed: true,
      detail: "Do-not-call enforcement is off.",
    });
  }

  const parts = zonedParts(input.now, input.timeZone);
  if (policy.enforceCallingHours) {
    const ok = withinWindow(parts, policy.windowStart, policy.windowEnd, policy.days);
    const dayLabel = policy.days.map((d) => weekdayName(d).slice(0, 3)).join(", ");
    checks.push({
      id: "hours",
      label: "Calling hours",
      passed: ok,
      detail: ok
        ? `Local time is inside ${formatHHMM(parseHHMM(policy.windowStart))}–${formatHHMM(parseHHMM(policy.windowEnd))} (${input.timeZone}).`
        : `Local time is outside ${formatHHMM(parseHHMM(policy.windowStart))}–${formatHHMM(parseHHMM(policy.windowEnd))} on ${dayLabel} (${input.timeZone}).`,
    });
  } else {
    checks.push({
      id: "hours",
      label: "Calling hours",
      passed: true,
      detail: "Calling-hour enforcement is off.",
    });
  }

  const underCap = input.dialsToday < policy.dailyCap;
  checks.push({
    id: "daily_cap",
    label: "Daily cap",
    passed: underCap,
    detail: underCap
      ? `${input.dialsToday} of ${policy.dailyCap} dials used today.`
      : `Daily cap reached (${input.dialsToday} of ${policy.dailyCap}).`,
  });

  const underAttempts = input.attemptsForContact < policy.maxAttempts;
  checks.push({
    id: "attempts",
    label: "Retry limit",
    passed: underAttempts,
    detail: underAttempts
      ? `${input.attemptsForContact} of ${policy.maxAttempts} attempts used for this lead.`
      : `Retry limit reached (${input.attemptsForContact} of ${policy.maxAttempts}).`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}

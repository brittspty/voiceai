import type { CallingPolicy } from "../types";
import { parseHHMM, withinWindow, zonedParts } from "../time";
import { digitsOnly } from "../phone";
import { zoneForAreaCode } from "./area-codes";

export const AIS2L_OPEN_MINUTES = 9 * 60;
export const AIS2L_CLOSE_MINUTES = 20 * 60;
export const UNKNOWN_TIMEZONE_RETRY_MS = 6 * 60 * 60 * 1000;

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function validTimeZone(zone: string | null | undefined) {
  const value = (zone || "").trim();
  if (!value) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export function areaCodeFromPhone(phone: string) {
  let digits = digitsOnly(phone);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return digits.slice(0, 3);
}

export type LeadZone = { timeZone: string; source: "address" | "area_code" } | { timeZone: null; source: "unknown" };

/**
 * Address timezone wins when it is a real zone and not just the office or workspace default.
 * Otherwise the phone's area code is used. If neither is known, the zone is unknown.
 */
export function resolveLeadTimezone(input: {
  addressTimezone?: string | null;
  phone?: string | null;
  officeTimezones?: Array<string | null | undefined>;
}): LeadZone {
  const address = validTimeZone(input.addressTimezone);
  const fallbacks = new Set((input.officeTimezones ?? []).map((zone) => validTimeZone(zone)).filter((zone): zone is string => Boolean(zone)));
  if (address && !fallbacks.has(address)) return { timeZone: address, source: "address" };
  const code = input.phone ? areaCodeFromPhone(input.phone) : null;
  const fromPhone = code ? zoneForAreaCode(code) : null;
  if (fromPhone) return { timeZone: fromPhone, source: "area_code" };
  return { timeZone: null, source: "unknown" };
}

/** Intersect the published window with 9:00 AM–8:00 PM. An empty intersection closes every day. */
export function clampCallingWindow(policy: CallingPolicy): CallingPolicy {
  const start = Math.max(parseHHMM(policy.windowStart), AIS2L_OPEN_MINUTES);
  const end = Math.min(parseHHMM(policy.windowEnd), AIS2L_CLOSE_MINUTES);
  if (end <= start) {
    return { ...policy, windowStart: "09:00", windowEnd: "20:00", days: [], enforceCallingHours: true, enforceDnc: true };
  }
  return {
    ...policy,
    windowStart: hhmm(start),
    windowEnd: hhmm(end),
    enforceCallingHours: true,
    enforceDnc: true,
  };
}

export function withinAis2lHours(now: Date, timeZone: string, policy: CallingPolicy) {
  const clamped = clampCallingWindow(policy);
  return withinWindow(zonedParts(now, timeZone), clamped.windowStart, clamped.windowEnd, clamped.days);
}

export type CallingDecision =
  | { action: "queue"; reason: "unknown_timezone"; runAt: Date }
  | { action: "dial"; timeZone: string; source: "address" | "area_code"; policy: CallingPolicy; insideHours: boolean };

export function callingDecision(input: {
  now: Date;
  phone: string;
  addressTimezone?: string | null;
  officeTimezones?: Array<string | null | undefined>;
  policy: CallingPolicy;
  retryMs?: number;
}): CallingDecision {
  const zone = resolveLeadTimezone(input);
  if (!zone.timeZone) {
    const retryMs = input.retryMs ?? UNKNOWN_TIMEZONE_RETRY_MS;
    return { action: "queue", reason: "unknown_timezone", runAt: new Date(input.now.getTime() + retryMs) };
  }
  const policy = clampCallingWindow(input.policy);
  return {
    action: "dial",
    timeZone: zone.timeZone,
    source: zone.source,
    policy,
    insideHours: withinAis2lHours(input.now, zone.timeZone, input.policy),
  };
}

export function leadDialPlan(input: {
  enabled: boolean;
  now: Date;
  phone: string;
  addressTimezone?: string | null;
  officeTimezones?: Array<string | null | undefined>;
  policy: CallingPolicy;
}) {
  if (!input.enabled) return { enabled: false as const };
  return { enabled: true as const, ...callingDecision(input) };
}

export function unknownTimezoneGate<T extends { id: string; passed: boolean; detail: string }>(result: { passed: boolean; checks: T[] }) {
  const checks = result.checks.map((check) =>
    check.id === "hours"
      ? { ...check, passed: false, detail: "The lead's timezone is unknown, so this call is queued and will not be dialed." }
      : check,
  );
  return { passed: false as const, checks };
}

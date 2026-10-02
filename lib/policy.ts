import { prisma } from "./db";
import { DEFAULT_POLICY, type CallingPolicy, type ConsentLevel } from "./types";

export function asPolicy(value: unknown): CallingPolicy {
  const raw = value && typeof value === "object" ? (value as Partial<CallingPolicy>) : {};
  const days = Array.isArray(raw.days) ? raw.days.map(Number).filter((n) => n >= 0 && n <= 6) : DEFAULT_POLICY.days;
  const min = raw.minConsent;
  const minConsent: ConsentLevel = min === "none" || min === "low" || min === "medium" || min === "high" ? min : DEFAULT_POLICY.minConsent;
  return {
    windowStart: typeof raw.windowStart === "string" ? raw.windowStart : DEFAULT_POLICY.windowStart,
    windowEnd: typeof raw.windowEnd === "string" ? raw.windowEnd : DEFAULT_POLICY.windowEnd,
    days,
    dailyCap: Number(raw.dailyCap ?? DEFAULT_POLICY.dailyCap),
    maxAttempts: Number(raw.maxAttempts ?? DEFAULT_POLICY.maxAttempts),
    retryBackoffMinutes: Number(raw.retryBackoffMinutes ?? DEFAULT_POLICY.retryBackoffMinutes),
    requireConsent: raw.requireConsent !== false,
    enforceDnc: raw.enforceDnc !== false,
    enforceCallingHours: raw.enforceCallingHours !== false,
    minConsent,
  };
}

export async function getPublishedPolicy() {
  const published = await prisma.callingRulesVersion.findFirst({
    where: { status: "published" },
    orderBy: { version: "desc" },
  });
  return {
    version: published,
    policy: published ? asPolicy(published.config) : DEFAULT_POLICY,
  };
}

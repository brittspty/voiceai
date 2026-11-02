/**
 * Consent check for JAI product analytics.
 *
 * Draft PR #46 is not merged (https://github.com/brittspty/voiceai/pull/46,
 * head 6507d011fb029ab4842cfceda76fd17514d17dda). Until a reader is registered,
 * this returns "none". Client dashboards, share links, and any script that
 * could run on a client website therefore do not load PostHog.
 *
 * Internal staff pages do not consult this check.
 *
 * How to hook #46 in after it merges:
 * `lib/consent/levels.ts` exports `levelMeets(choice, "medium")`. That is true
 * only for "medium" and "high". The website snippet stores the latest choice
 * in localStorage under `diver_consent_<clientKey>` as
 * `{ level, action, version }`. Withdrawal is `action: "withdraw"`.
 * Also require `version === CONSENT_WORDING_VERSION` from `lib/consent/copy.ts`
 * so a choice made against old wording does not count.
 *
 *   import { CONSENT_WORDING_VERSION } from "@/lib/consent/copy";
 *   import { levelMeets } from "@/lib/consent/levels";
 *   registerAnalyticsConsent(() => {
 *     const record = JSON.parse(localStorage.getItem(`diver_consent_${clientKey}`) || "null");
 *     const level = consentLevelFromDiverRecord(record);
 *     if (!record || record.version !== CONSENT_WORDING_VERSION) return "none";
 *     if (level !== "medium" && level !== "high") return level;
 *     return levelMeets(level, "medium") ? level : "none";
 *   });
 *
 * `analyticsConsentGranted` matches `levelMeets(choice, "medium")`.
 * `readDiverConsentRecord` reads the same storage key the snippet writes.
 */

export const ANALYTICS_CONSENT_LEVELS = ["none", "reject", "low", "medium", "high"] as const;
export type AnalyticsConsentLevel = (typeof ANALYTICS_CONSENT_LEVELS)[number];

export type AnalyticsConsentReader = () => AnalyticsConsentLevel;

const RANK: Record<Exclude<AnalyticsConsentLevel, "none">, number> = {
  reject: 0,
  low: 1,
  medium: 2,
  high: 3,
};

let reader: AnalyticsConsentReader = () => "none";

export function registerAnalyticsConsent(next: AnalyticsConsentReader) {
  reader = next;
}

export function resetAnalyticsConsentReader() {
  reader = () => "none";
}

export function readAnalyticsConsent(): AnalyticsConsentLevel {
  try {
    return normalizeConsentLevel(reader());
  } catch {
    return "none";
  }
}

export function normalizeConsentLevel(value: unknown): AnalyticsConsentLevel {
  if (value === "reject" || value === "low" || value === "medium" || value === "high" || value === "none") return value;
  return "none";
}

/** True only at medium or high. Same threshold as levelMeets(choice, "medium") in PR #46. */
export function analyticsConsentGranted(level: unknown): boolean {
  const choice = normalizeConsentLevel(level);
  if (choice === "none" || choice === "reject") return false;
  return RANK[choice] >= RANK.medium;
}

export function diverConsentStorageKey(clientKey: string) {
  return `diver_consent_${clientKey}`;
}

/** Parses the JSON #46's snippet writes. Withdrawal and unknown shapes are no consent. */
export function consentLevelFromDiverRecord(record: unknown): AnalyticsConsentLevel {
  if (!record || typeof record !== "object") return "none";
  const row = record as { level?: unknown; action?: unknown };
  if (row.action === "withdraw") return "none";
  return normalizeConsentLevel(row.level);
}

export function readDiverConsentRecord(
  storage: { getItem(key: string): string | null } | null | undefined,
  clientKey: string,
): AnalyticsConsentLevel {
  if (!storage || !clientKey.trim()) return "none";
  try {
    const raw = storage.getItem(diverConsentStorageKey(clientKey));
    if (!raw) return "none";
    return consentLevelFromDiverRecord(JSON.parse(raw));
  } catch {
    return "none";
  }
}

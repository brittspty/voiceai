import type { Env } from "../config";
import type { AudiencePlatform } from "./payloads";

/** Stored source for a data-market MAID list. `maid_market` is the same brokered source. */
export const MAID_MARKET_SOURCES = ["data_market_maid", "maid_market"] as const;

export const GOOGLE_FIRST_PARTY_ONLY =
  "Google requires first-party data. Not eligible unless Google allowlists this account.";

export class GoogleCustomerMatchBlockedError extends Error {
  constructor(message = GOOGLE_FIRST_PARTY_ONLY) {
    super(message);
    this.name = "GoogleCustomerMatchBlockedError";
  }
}

export function isBrokeredAudienceSource(source: string) {
  return (MAID_MARKET_SOURCES as readonly string[]).includes(source);
}

/**
 * Per-account allowlist. Off unless GOOGLE_BROKERED_ALLOWLISTED names this account.
 * A bare "on" does not allow every account.
 */
export function googleBrokeredAllowlisted(accountId: string | null | undefined, env: Env = process.env) {
  const id = (accountId || "").trim();
  if (!id) return false;
  const raw = (env.GOOGLE_BROKERED_ALLOWLISTED || "").trim();
  if (!raw || raw === "0" || raw === "false" || raw === "off" || raw === "no" || raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return false;
  }
  return raw.split(",").map((part) => part.trim()).filter(Boolean).includes(id);
}

export function googleCustomerMatchEligible(input: {
  platform?: AudiencePlatform | string;
  source: string;
  accountId?: string | null;
  env?: Env;
}) {
  if (input.platform && input.platform !== "google_customer_match") return { eligible: true, reason: null as string | null };
  if (!isBrokeredAudienceSource(input.source)) return { eligible: true, reason: null };
  if (googleBrokeredAllowlisted(input.accountId, input.env)) return { eligible: true, reason: null };
  return { eligible: false, reason: GOOGLE_FIRST_PARTY_ONLY };
}

export function assertGoogleCustomerMatch(input: {
  platform: AudiencePlatform | string;
  source: string;
  accountId?: string | null;
  env?: Env;
}) {
  const decision = googleCustomerMatchEligible(input);
  if (!decision.eligible) throw new GoogleCustomerMatchBlockedError(decision.reason || GOOGLE_FIRST_PARTY_ONLY);
}

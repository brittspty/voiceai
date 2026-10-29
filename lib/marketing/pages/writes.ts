import { createHmac } from "node:crypto";
import type { Env } from "../config";
import { graphVersion } from "../config";

export const READ_TOKEN_ENV = "META_ACCESS_TOKEN";
export const READ_SECRET_ENV = "META_APP_SECRET";

const ALLOWED_KEYS = new Set([
  "platform",
  "level",
  "operation",
  "externalId",
  "adGroupExternalId",
  "customerId",
  "from",
  "to",
  "pausedBySystem",
]);

/** Local bookkeeping. These never go to Meta or Google. */
const METADATA_KEYS = new Set(["adId", "adName", "landingPageId", "trackedId"]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DIGITS = /^\d{1,32}$/;

export type AdPlatformWrite = "meta" | "google_ads";

export type AllowedChange = {
  platform: AdPlatformWrite;
  level: "ad";
  operation: "update_status";
  externalId: string;
  adGroupExternalId: string;
  customerId: string;
  from: "ACTIVE" | "PAUSED";
  to: "ACTIVE" | "PAUSED";
  pausedBySystem: boolean;
};

export type WritePlan = AllowedChange & {
  adId: string;
  adName: string;
  landingPageId: string;
  trackedId?: string;
};

export function reviewWrite(input: unknown): { ok: true; change: AllowedChange } | { ok: false; reason: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "Change is not an object." };
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, reason: `Field ${key} is not allowed.` };
  }
  if (record.operation !== "update_status") return { ok: false, reason: "Only an ad status change is allowed." };
  if (record.level !== "ad") return { ok: false, reason: "Only an ad can change, not a campaign or ad group." };
  if (record.platform !== "meta" && record.platform !== "google_ads") return { ok: false, reason: "Only Meta and Google ads can change." };
  if (record.from !== "ACTIVE" && record.from !== "PAUSED") return { ok: false, reason: "Status can only start from ACTIVE or PAUSED." };
  if (record.to !== "ACTIVE" && record.to !== "PAUSED") return { ok: false, reason: "Status can only become ACTIVE or PAUSED." };
  if (record.from === record.to) return { ok: false, reason: "The status is already set." };
  if (record.from === "ACTIVE" && record.to !== "PAUSED") return { ok: false, reason: "An active ad can only be paused." };
  if (record.from === "PAUSED" && record.to !== "ACTIVE") return { ok: false, reason: "A paused ad can only be turned back on." };
  if (record.to === "ACTIVE" && record.pausedBySystem !== true) {
    return { ok: false, reason: "Only an ad this system paused can be turned back on." };
  }
  if (record.to === "PAUSED" && record.pausedBySystem !== false) {
    return { ok: false, reason: "A pause is for an ad that is still running." };
  }
  if (typeof record.externalId !== "string" || !ID_PATTERN.test(record.externalId)) {
    return { ok: false, reason: "The ad id is not valid." };
  }
  const adGroupExternalId = typeof record.adGroupExternalId === "string" ? record.adGroupExternalId : "";
  const customerId = typeof record.customerId === "string" ? record.customerId : "";
  if (record.platform === "google_ads") {
    if (!DIGITS.test(customerId) || !DIGITS.test(adGroupExternalId) || !DIGITS.test(record.externalId)) {
      return { ok: false, reason: "Google ads need a customer id, ad group id, and ad id." };
    }
  }
  return {
    ok: true,
    change: {
      platform: record.platform,
      level: "ad",
      operation: "update_status",
      externalId: record.externalId,
      adGroupExternalId,
      customerId,
      from: record.from,
      to: record.to,
      pausedBySystem: record.pausedBySystem === true,
    },
  };
}

export function metaStatusBody(change: AllowedChange) {
  return { status: change.to };
}

export function googleStatusValue(change: AllowedChange) {
  return change.to === "ACTIVE" ? "ENABLED" : "PAUSED";
}

export function googleMutateBody(change: AllowedChange) {
  return {
    operations: [
      {
        updateMask: "status",
        update: {
          resourceName: `customers/${change.customerId}/adGroupAds/${change.adGroupExternalId}~${change.externalId}`,
          status: googleStatusValue(change),
        },
      },
    ],
  };
}

export function collectKeys(value: unknown, into = new Set<string>()) {
  if (!value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return into;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    into.add(key);
    collectKeys(child, into);
  }
  return into;
}

export function adStatusPatch(next: "active" | "paused", platform: AdPlatformWrite) {
  const statusRaw = next === "paused" ? "PAUSED" : platform === "google_ads" ? "ENABLED" : "ACTIVE";
  return { status: next, statusRaw };
}

export type CredentialRow = {
  clientKey: string;
  platform: AdPlatformWrite;
  secretRef: string;
  appSecretRef: string;
  extraSecretRef: string;
  accountExternalId: string;
  loginCustomerId: string;
  scopes: string[];
};

const BLOCKED_REFS = new Set([READ_TOKEN_ENV, READ_SECRET_ENV, "META_APP_ID"]);

export function secretRefIssue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the environment variable name.";
  if (BLOCKED_REFS.has(trimmed)) return "Use a write token. The read token cannot pause ads.";
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(trimmed)) return "Enter the environment variable name, not the token.";
  return null;
}

export function customerIdIssue(value: string) {
  const digits = value.trim().replace(/-/g, "");
  if (!digits) return "Enter the Google Ads customer id.";
  if (!/^\d{6,12}$/.test(digits)) return "The customer id should be digits only.";
  return null;
}

export function defaultCredential(clientKey: string, platform: AdPlatformWrite, env: Env): CredentialRow {
  if (platform === "meta") {
    return {
      clientKey,
      platform,
      secretRef: "META_PAGE_WRITE_TOKEN",
      appSecretRef: "META_PAGE_WRITE_APP_SECRET",
      extraSecretRef: "",
      accountExternalId: "",
      loginCustomerId: "",
      scopes: ["ads_management"],
    };
  }
  return {
    clientKey,
    platform: "google_ads",
    secretRef: "GOOGLE_ADS_WRITE_ACCESS_TOKEN",
    appSecretRef: "",
    extraSecretRef: "GOOGLE_ADS_DEVELOPER_TOKEN",
    accountExternalId: (env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "").trim(),
    loginCustomerId: (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "").trim(),
    scopes: ["adwords"],
  };
}

function envValue(env: Env, name: string) {
  if (!name.trim()) return "";
  return (env[name] || "").trim();
}

function hasScope(scopes: string[], needle: string) {
  return scopes.some((scope) => scope.trim().toLowerCase() === needle);
}

export type ResolvedWrite =
  | {
      mode: "live";
      accessToken: string;
      appSecret: string;
      developerToken: string;
      customerId: string;
      loginCustomerId: string;
    }
  | { mode: "dry_run"; reason: string };

export function resolveWriteAccess(row: CredentialRow | undefined, env: Env, platform: AdPlatformWrite): ResolvedWrite {
  if (!row) return { mode: "dry_run", reason: platform === "meta" ? "No Meta write credential is saved for this client." : "No Google Ads write credential is saved for this client." };
  if (BLOCKED_REFS.has(row.secretRef) || BLOCKED_REFS.has(row.appSecretRef) || BLOCKED_REFS.has(row.extraSecretRef)) {
    return { mode: "dry_run", reason: "Write credentials must be separate from the read token." };
  }
  const token = envValue(env, row.secretRef);
  if (!token) return { mode: "dry_run", reason: `${row.secretRef || "Write token"} is empty.` };
  if (platform === "meta") {
    if (!hasScope(row.scopes, "ads_management")) return { mode: "dry_run", reason: "Recorded scopes do not include ads_management." };
    return {
      mode: "live",
      accessToken: token,
      appSecret: envValue(env, row.appSecretRef),
      developerToken: "",
      customerId: "",
      loginCustomerId: "",
    };
  }
  if (!hasScope(row.scopes, "adwords")) return { mode: "dry_run", reason: "Recorded scopes do not include adwords." };
  const developerToken = envValue(env, row.extraSecretRef);
  if (!developerToken) return { mode: "dry_run", reason: "Google Ads developer token is empty." };
  if (customerIdIssue(row.accountExternalId)) return { mode: "dry_run", reason: "Google Ads customer id is missing." };
  return {
    mode: "live",
    accessToken: token,
    appSecret: "",
    developerToken,
    customerId: row.accountExternalId.replace(/-/g, ""),
    loginCustomerId: row.loginCustomerId.replace(/-/g, ""),
  };
}

export function credentialFor(clientKey: string, platform: AdPlatformWrite, rows: CredentialRow[], env: Env) {
  const saved = rows.find((row) => row.clientKey === clientKey && row.platform === platform);
  return resolveWriteAccess(saved ?? defaultCredential(clientKey, platform, env), env, platform);
}

export function writeConnected(access: ResolvedWrite) {
  return access.mode === "live";
}

export function dryRunLog(action: "pause" | "resume", pageName: string, adNames: string[]) {
  const names = adNames.length ? adNames.join(", ") : "no matching ads";
  return `dry run: would ${action} ${adNames.length} ad${adNames.length === 1 ? "" : "s"} for ${pageName} (${names})`;
}

export function redactSecrets(text: string, secrets: string[]) {
  let redacted = text.replace(/access_token=[^&\s]+/gi, "access_token=[redacted]").replace(/developer-token:\s*\S+/gi, "developer-token: [redacted]");
  for (const secret of secrets) {
    if (secret.length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type WriteOutcome =
  | { ok: true; mode: "dry_run"; log: string }
  | { ok: true; mode: "live" }
  | { ok: false; mode: "blocked" | "live"; reason: string };

function appSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

export async function performWrite(input: {
  plan: WritePlan | Record<string, unknown>;
  access: ResolvedWrite;
  pageName: string;
  env?: Env;
  fetchImpl?: FetchLike;
}): Promise<WriteOutcome> {
  if (!input.plan || typeof input.plan !== "object" || Array.isArray(input.plan)) {
    return { ok: false, mode: "blocked", reason: "Change is not an object." };
  }
  for (const key of Object.keys(input.plan)) {
    if (!ALLOWED_KEYS.has(key) && !METADATA_KEYS.has(key)) return { ok: false, mode: "blocked", reason: `Field ${key} is not allowed.` };
  }
  const picked: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) picked[key] = (input.plan as Record<string, unknown>)[key];
  const verdict = reviewWrite(picked);
  if (!verdict.ok) return { ok: false, mode: "blocked", reason: verdict.reason };
  const change = verdict.change;
  if (change.platform === "google_ads" && input.access.mode === "live" && input.access.customerId && change.customerId !== input.access.customerId) {
    return { ok: false, mode: "blocked", reason: "The ad is not in the connected Google Ads account." };
  }
  const adName = typeof (input.plan as { adName?: unknown }).adName === "string" ? (input.plan as { adName: string }).adName : change.externalId;
  if (input.access.mode === "dry_run") {
    return { ok: true, mode: "dry_run", log: dryRunLog(change.to === "PAUSED" ? "pause" : "resume", input.pageName, [adName]) };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const secrets = [input.access.accessToken, input.access.appSecret, input.access.developerToken].filter(Boolean);
  try {
    if (change.platform === "meta") {
      const version = graphVersion(input.env ?? process.env);
      const url = new URL(`https://graph.facebook.com/${version}/${change.externalId}`);
      url.searchParams.set("access_token", input.access.accessToken);
      if (input.access.appSecret) url.searchParams.set("appsecret_proof", appSecretProof(input.access.accessToken, input.access.appSecret));
      const body = new URLSearchParams(metaStatusBody(change));
      const response = await fetchImpl(url.toString(), { method: "POST", body });
      if (!response.ok) {
        const text = redactSecrets(await response.text(), secrets);
        return { ok: false, mode: "live", reason: `Meta did not change the ad (${response.status}). ${text.slice(0, 180)}` };
      }
      return { ok: true, mode: "live" };
    }
    const version = ((input.env ?? process.env).GOOGLE_ADS_API_VERSION || "v18").trim();
    const safeVersion = /^v\d+$/.test(version) ? version : "v18";
    const endpoint = `https://googleads.googleapis.com/${safeVersion}/customers/${change.customerId}/adGroupAds:mutate`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${input.access.accessToken}`,
      "developer-token": input.access.developerToken,
      "content-type": "application/json",
    };
    if (input.access.loginCustomerId) headers["login-customer-id"] = input.access.loginCustomerId;
    const response = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(googleMutateBody(change)) });
    if (!response.ok) {
      const text = redactSecrets(await response.text(), secrets);
      return { ok: false, mode: "live", reason: `Google Ads did not change the ad (${response.status}). ${text.slice(0, 180)}` };
    }
    return { ok: true, mode: "live" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The ad platform did not respond.";
    return { ok: false, mode: "live", reason: redactSecrets(message, secrets).slice(0, 180) };
  }
}

export const LIVE_RETRY_MS = 10 * 60 * 1000;

export function shouldRetryLive(lastFailureAt: string | null, now: number) {
  if (!lastFailureAt) return true;
  const at = Date.parse(lastFailureAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= LIVE_RETRY_MS;
}

import { createHmac } from "node:crypto";
import type { Env } from "../config";
import { googleAdsApiVersion, googleAdsEnv, graphVersion } from "../config";
import { AdBudgetWriteBlockedError, assertNoAdBudgetWrite } from "../connectors/budget-lock";
import { assertGoogleAdsAllowed, GoogleAdsWriteBlockedError } from "../connectors/google-ads-client";
import { destinationMatches } from "./probe";

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
const METADATA_KEYS = new Set(["adId", "adName", "landingPageId", "trackedId", "accountExternalId", "pageUrl", "pausedAt", "clientKey", "pageName"]);

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
  accountExternalId: string;
  pageUrl: string;
  pausedAt: string;
  clientKey: string;
  pageName: string;
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
    if (!/^\d{10}$/.test(customerId) || !DIGITS.test(adGroupExternalId) || !DIGITS.test(record.externalId)) {
      return { ok: false, reason: "Google ads need a 10-digit customer id, an ad group id, and an ad id." };
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
  if (!value.trim()) return "Enter the Google Ads customer id.";
  if (!/^\d{10}$/.test(value.trim().replace(/-/g, ""))) return "The customer id should be 10 digits.";
  return null;
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
  if (!saved) return { mode: "dry_run" as const, reason: "No write credential is saved for this client." };
  return resolveWriteAccess(saved, env, platform);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function accountDigits(value: string) {
  return value.trim().replace(/^act_/, "").replace(/-/g, "");
}

export function metaLinks(creative: unknown) {
  const record = asRecord(creative);
  const story = asRecord(record.object_story_spec);
  const link = asRecord(story.link_data).link;
  const video = asRecord(asRecord(story.video_data).call_to_action);
  const ctaLink = asRecord(video.value).link;
  const links = [link, ctaLink].filter((item): item is string => typeof item === "string");
  const urls = asRecord(record.asset_feed_spec).link_urls;
  if (Array.isArray(urls)) {
    for (const item of urls) {
      const website = asRecord(item).website_url;
      if (typeof website === "string") links.push(website);
    }
  }
  return links;
}

export function judgeMetaAd(
  body: unknown,
  expected: { accountId: string; pageUrl: string; action: "pause" | "resume"; pausedAt?: string },
): { ok: true } | { ok: false; reason: string } {
  const record = asRecord(body);
  if (record.error || typeof record.id !== "string") return { ok: false, reason: "Meta did not return an ad." };
  if (typeof record.adset_id !== "string" || !record.adset_id) return { ok: false, reason: "That id is not an ad." };
  const account = accountDigits(String(record.account_id || ""));
  if (!account || account !== accountDigits(expected.accountId)) return { ok: false, reason: "That ad is not in this client's account." };
  const status = String(record.effective_status || record.status || "");
  if (expected.action === "pause" && status !== "ACTIVE") return { ok: false, reason: "That ad is not running." };
  if (expected.action === "resume" && status !== "PAUSED") return { ok: false, reason: "That ad is no longer paused. It was left unchanged." };
  if (expected.action === "pause" && !metaLinks(record.creative).some((link) => destinationMatches(link, expected.pageUrl))) {
    return { ok: false, reason: "That ad does not send people to this page." };
  }
  if (expected.action === "resume" && expected.pausedAt) {
    const updated = Date.parse(String(record.updated_time || ""));
    const paused = Date.parse(expected.pausedAt);
    if (Number.isFinite(updated) && Number.isFinite(paused) && updated > paused + 120_000) {
      return { ok: false, reason: "That ad changed after we paused it. It was left unchanged." };
    }
  }
  return { ok: true };
}

export function judgeGoogleAd(
  body: unknown,
  expected: { adId: string; pageUrl: string; action: "pause" | "resume" },
): { ok: true } | { ok: false; reason: string } {
  const results = asRecord(body).results;
  const row = asRecord(Array.isArray(results) ? results[0] : null);
  const adGroupAd = asRecord(row.adGroupAd);
  const ad = asRecord(adGroupAd.ad);
  if (String(ad.id || "") !== expected.adId) return { ok: false, reason: "Google Ads did not return that ad." };
  const status = String(adGroupAd.status || "");
  if (expected.action === "pause" && status !== "ENABLED") return { ok: false, reason: "That ad is not running." };
  if (expected.action === "resume" && status !== "PAUSED") return { ok: false, reason: "That ad is no longer paused. It was left unchanged." };
  if (expected.action === "pause") {
    const urls = Array.isArray(ad.finalUrls) ? ad.finalUrls.filter((item): item is string => typeof item === "string") : [];
    if (!urls.some((url) => destinationMatches(url, expected.pageUrl))) return { ok: false, reason: "That ad does not send people to this page." };
  }
  return { ok: true };
}

const GOOGLE_BODY_KEYS = new Set(["operations", "updateMask", "update", "resourceName", "status"]);

export function googleStatusMutateAllowed(url: string, body: unknown) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "googleads.googleapis.com") return false;
  if (parsed.username || parsed.password || parsed.search || parsed.port) return false;
  if (!/^\/v\d+\/customers\/\d{6,12}\/adGroupAds:mutate$/.test(parsed.pathname)) return false;
  for (const key of collectKeys(body)) {
    if (!GOOGLE_BODY_KEYS.has(key)) return false;
  }
  const operations = asRecord(body).operations;
  if (!Array.isArray(operations) || operations.length !== 1) return false;
  const operation = asRecord(operations[0]);
  if (operation.updateMask !== "status") return false;
  const update = asRecord(operation.update);
  const keys = Object.keys(update).sort();
  if (keys.join(",") !== "resourceName,status") return false;
  return update.status === "PAUSED" || update.status === "ENABLED";
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
  const plan = input.plan as WritePlan;
  const action = change.to === "PAUSED" ? "pause" : "resume";
  try {
    if (change.platform === "meta") {
      const version = graphVersion(input.env ?? process.env);
      const lookup = new URL(`https://graph.facebook.com/${version}/${change.externalId}`);
      lookup.searchParams.set("fields", "id,status,effective_status,adset_id,account_id,updated_time,creative{object_story_spec,asset_feed_spec}");
      lookup.searchParams.set("access_token", input.access.accessToken);
      if (input.access.appSecret) lookup.searchParams.set("appsecret_proof", appSecretProof(input.access.accessToken, input.access.appSecret));
      assertNoAdBudgetWrite({ method: "GET", url: lookup.toString() });
      const looked = await fetchImpl(lookup.toString(), { method: "GET" });
      const judged = judgeMetaAd(await looked.json().catch(() => null), {
        accountId: plan.accountExternalId || "",
        pageUrl: plan.pageUrl || "",
        action,
        pausedAt: plan.pausedAt,
      });
      if (!judged.ok) return { ok: false, mode: "blocked", reason: judged.reason };
      const url = new URL(`https://graph.facebook.com/${version}/${change.externalId}`);
      url.searchParams.set("access_token", input.access.accessToken);
      if (input.access.appSecret) url.searchParams.set("appsecret_proof", appSecretProof(input.access.accessToken, input.access.appSecret));
      const body = new URLSearchParams(metaStatusBody(change));
      assertNoAdBudgetWrite({ method: "POST", url: url.toString(), body });
      const response = await fetchImpl(url.toString(), { method: "POST", body });
      if (!response.ok) {
        const text = redactSecrets(await response.text(), secrets);
        return { ok: false, mode: "live", reason: `Meta did not change the ad (${response.status}). ${text.slice(0, 180)}` };
      }
      return { ok: true, mode: "live" };
    }
    const env = input.env ?? process.env;
    if (!googleAdsEnv(env).customerIds.includes(change.customerId)) {
      return { ok: false, mode: "blocked", reason: "That Google Ads customer is not in GOOGLE_ADS_CUSTOMER_IDS." };
    }
    const version = googleAdsApiVersion(env);
    const headers: Record<string, string> = {
      authorization: `Bearer ${input.access.accessToken}`,
      "developer-token": input.access.developerToken,
      "content-type": "application/json",
    };
    if (input.access.loginCustomerId) headers["login-customer-id"] = input.access.loginCustomerId;
    const searchUrl = `https://googleads.googleapis.com/${version}/customers/${change.customerId}/googleAds:search`;
    const searchBody = {
      query: `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE ad_group_ad.ad.id = ${change.externalId}`,
    };
    assertNoAdBudgetWrite({ method: "POST", url: searchUrl, body: searchBody });
    assertGoogleAdsAllowed("read", "POST", searchUrl);
    const searched = await fetchImpl(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(searchBody),
    });
    const judged = judgeGoogleAd(await searched.json().catch(() => null), { adId: change.externalId, pageUrl: plan.pageUrl || "", action });
    if (!judged.ok) return { ok: false, mode: "blocked", reason: judged.reason };
    const endpoint = `https://googleads.googleapis.com/${version}/customers/${change.customerId}/adGroupAds:mutate`;
    const mutateBody = googleMutateBody(change);
    assertNoAdBudgetWrite({ method: "POST", url: endpoint, body: mutateBody });
    assertGoogleAdsAllowed("page-status", "POST", endpoint);
    if (!googleStatusMutateAllowed(endpoint, mutateBody)) return { ok: false, mode: "blocked", reason: "That Google Ads change is not an ad status update." };
    const response = await fetchImpl(endpoint, { method: "POST", headers, body: JSON.stringify(mutateBody) });
    if (!response.ok) {
      const text = redactSecrets(await response.text(), secrets);
      return { ok: false, mode: "live", reason: `Google Ads did not change the ad (${response.status}). ${text.slice(0, 180)}` };
    }
    return { ok: true, mode: "live" };
  } catch (error) {
    if (error instanceof GoogleAdsWriteBlockedError || error instanceof AdBudgetWriteBlockedError) {
      return { ok: false, mode: "blocked", reason: "Only an ad status change is allowed." };
    }
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

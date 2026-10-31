import type { Env } from "../config";
import { offlineConversionsLiveEnabled } from "../config";
import { AdBudgetWriteBlockedError, assertNoAdBudgetWrite } from "../connectors/budget-lock";
import { assertGoogleAdsAllowed, googleAdsGuard } from "../connectors/google-ads-client";
import { conversionLogLine, payloadHasRawPii, type LogSink } from "./log";
import {
  googleCredentials,
  googleUploadUrl,
  metaCredentials,
  metaEventsUrl,
  platformReady,
} from "./payloads";
import type { ConversionPlatformName, UploadRecord } from "./types";

/**
 * Least privilege for the shared Google Ads scope: the only ad request this
 * module can make is UploadClickConversions. Meta is limited to dataset events.
 * Campaigns, budgets, keywords, and conversion adjustments are refused.
 */
const META_HOST = "graph.facebook.com";
const GOOGLE_HOST = "googleads.googleapis.com";

export function isAllowedConversionUpload(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.searchParams.has("access_token")) return false;
  if (url.hostname === META_HOST) return /^\/v\d+\.\d+\/\d+\/events$/.test(url.pathname);
  if (url.hostname === GOOGLE_HOST) return googleAdsGuard("upload", "POST", raw);
  return false;
}

export function assertConversionUploadUrl(raw: string) {
  if (!isAllowedConversionUpload(raw)) {
    throw new Error("Refusing a request that is not a conversion upload");
  }
}

export type UploadDestination = {
  metaDatasetId: string;
  googleCustomerId: string;
};

export type PlannedUpload = UploadRecord & { send: boolean; destination: UploadDestination };

export function storedUpload(upload: PlannedUpload, patch: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: upload.id,
    eventId: upload.eventId,
    platform: upload.platform,
    status: patch.status ?? upload.status,
    payload: upload.payload,
    attempts: patch.attempts ?? upload.attempts,
    errorCode: patch.errorCode ?? upload.errorCode,
    errorMessage: patch.errorMessage ?? upload.errorMessage,
    createdAt: upload.createdAt,
    sentAt: patch.sentAt === undefined ? upload.sentAt : patch.sentAt,
  };
}

type Wire = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  logBody: unknown;
};

export function buildWireRequest(
  platform: ConversionPlatformName,
  payload: unknown,
  env: Env,
  accessToken: string,
  destination: UploadDestination,
): Wire | { error: string } {
  if (platform === "meta") {
    const creds = metaCredentials(env);
    const url = metaEventsUrl(env, destination.metaDatasetId);
    if (!creds || !url) return { error: "missing_meta_credentials" };
    assertConversionUploadUrl(url);
    return {
      url,
      headers: { "content-type": "application/json" },
      body: { data: [payload], access_token: accessToken || creds.accessToken },
      logBody: { data: [payload] },
    };
  }
  const creds = googleCredentials(env);
  const url = googleUploadUrl(env, destination.googleCustomerId);
  if (!creds || !url || !accessToken) return { error: "missing_google_credentials" };
  assertGoogleAdsAllowed("upload", "POST", url);
  assertConversionUploadUrl(url);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
    "developer-token": creds.developerToken,
  };
  if (creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId;
  return { url, headers, body: payload, logBody: payload };
}

export function classifyUploadResponse(platform: ConversionPlatformName, status: number, body: unknown) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const text = JSON.stringify(body ?? "");
  const token = status === 401 || status === 403 || /"code"\s*:\s*190/.test(text) || /UNAUTHENTICATED|invalid_grant|expired/i.test(text);
  if (token) return { ok: false, errorCode: "token_expired", errorMessage: "The token expired." };
  const partial = record.partialFailureError || (Array.isArray(record.results) && record.results.some((row) => row && typeof row === "object" && "error" in (row as object)));
  if (status >= 200 && status < 300 && !partial) return { ok: true, errorCode: "", errorMessage: "" };
  return {
    ok: false,
    errorCode: "upload_rejected",
    errorMessage: platform === "meta" ? "Meta rejected the event." : "Google rejected the conversion.",
  };
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function resolveGoogleAccessToken(
  env: Env,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string } | { error: "missing_google_credentials" | "token_expired" }> {
  const creds = googleCredentials(env);
  if (!creds) return { error: "missing_google_credentials" as const };
  if (creds.accessToken) return { accessToken: creds.accessToken };
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return { error: "token_expired" as const };
  const parsed = (await response.json()) as { access_token?: string };
  if (!parsed.access_token) return { error: "token_expired" as const };
  return { accessToken: parsed.access_token };
}

export async function executeUploads(input: {
  uploads: PlannedUpload[];
  env: Env;
  fetchImpl: typeof fetch;
  log: LogSink;
  now: Date;
}) {
  let googleToken = "";
  const needsGoogle = input.uploads.some((upload) => upload.send && upload.platform === "google_ads");
  if (needsGoogle) {
    const resolved = await resolveGoogleAccessToken(input.env, input.fetchImpl);
    if ("accessToken" in resolved) googleToken = resolved.accessToken;
  }
  const uploads: UploadRecord[] = [];
  let sent = 0;
  for (const upload of input.uploads) {
    const mode = upload.send && offlineConversionsLiveEnabled(input.env) ? "live" : "dry_run";
    input.log(
      conversionLogLine({
        mode,
        platform: upload.platform,
        status: upload.send ? "ready" : upload.status,
        eventId: upload.eventId,
        uploadId: upload.id,
        payload: upload.payload,
      }),
    );
    if (!upload.send || mode !== "live") {
      uploads.push(storedUpload(upload));
      continue;
    }
    if (!platformReady(upload.platform, input.env) || payloadHasRawPii(upload.payload)) {
      uploads.push(
        storedUpload(upload, {
          status: "failed",
          errorCode: payloadHasRawPii(upload.payload) ? "raw_pii_blocked" : "missing_credentials",
          errorMessage: "The upload was blocked before it was sent.",
          attempts: upload.attempts + 1,
        }),
      );
      continue;
    }
    const token = upload.platform === "google_ads" ? googleToken : metaCredentials(input.env)?.accessToken || "";
    if (upload.platform === "google_ads" && !token) {
      uploads.push(
        storedUpload(upload, {
          status: "failed",
          attempts: upload.attempts + 1,
          errorCode: "token_expired",
          errorMessage: "The token expired.",
          sentAt: null,
        }),
      );
      continue;
    }
    const wire = buildWireRequest(upload.platform, upload.payload, input.env, token, upload.destination);
    if ("error" in wire) {
      uploads.push(
        storedUpload(upload, {
          status: "failed",
          attempts: upload.attempts + 1,
          errorCode: "missing_credentials",
          errorMessage: "The upload was blocked before it was sent.",
        }),
      );
      continue;
    }
    assertConversionUploadUrl(wire.url);
    try {
      assertNoAdBudgetWrite({ method: "POST", url: wire.url, body: wire.body });
    } catch (error) {
      if (error instanceof AdBudgetWriteBlockedError) {
        uploads.push(
          storedUpload(upload, {
            status: "failed",
            attempts: upload.attempts + 1,
            errorCode: "budget_write_blocked",
            errorMessage: "The upload was blocked before it was sent.",
          }),
        );
        continue;
      }
      throw error;
    }
    const response = await input.fetchImpl(wire.url, {
      method: "POST",
      headers: wire.headers,
      body: JSON.stringify(wire.body),
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
    const outcome = classifyUploadResponse(upload.platform, response.status, parsed);
    if (outcome.ok) sent += 1;
    uploads.push(
      storedUpload(upload, {
        status: outcome.ok ? "sent" : "failed",
        attempts: upload.attempts + 1,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        sentAt: outcome.ok ? input.now.toISOString() : null,
      }),
    );
  }
  return { uploads, sent };
}

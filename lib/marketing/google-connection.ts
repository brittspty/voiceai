import type { MarketingAccess } from "./access";
import {
  decideGoogleAdsSync,
  GOOGLE_ADS_REQUIRED,
  googleAdsEnabled,
  type Env,
} from "./config";
import { redactGoogleSecrets } from "./connectors/google-ads-client";
import { WORKSPACE_ID } from "./types";

const CREDENTIAL_LABELS: Record<(typeof GOOGLE_ADS_REQUIRED)[number], { id: string; label: string }> = {
  GOOGLE_ADS_DEVELOPER_TOKEN: { id: "developer-token", label: "Developer token" },
  GOOGLE_ADS_CLIENT_ID: { id: "oauth-client", label: "OAuth client" },
  GOOGLE_ADS_CLIENT_SECRET: { id: "oauth-client-secret", label: "OAuth client secret" },
  GOOGLE_ADS_REFRESH_TOKEN: { id: "refresh-token", label: "Refresh token" },
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: { id: "login-customer-id", label: "Login customer ID" },
};

export type GoogleAdsConnectionView = {
  enabled: boolean;
  chip: "not_connected" | "needs_attention" | "connected";
  chipLabel: "Not connected" | "Needs attention" | "Connected";
  summary: string;
  exampleData: boolean;
  readOnly: true;
  credentials: { id: string; label: string; present: boolean }[];
  lastSyncAt: string | null;
  error: string | null;
};

export function canViewGoogleAdsConnection(access: { kind: string }) {
  return access.kind === "super_admin" || access.kind === "account_manager";
}

export function googleAdsConnectionDenial(access: Pick<MarketingAccess, "kind">) {
  if (canViewGoogleAdsConnection(access)) return null;
  return { status: 403 as const, body: { error: "Not allowed" } };
}

function secretsFrom(env: Env) {
  return GOOGLE_ADS_REQUIRED.map((name) => (env[name] || "").trim()).filter((value) => value.length >= 6);
}

/** Status for the setup screen. Credential values are never copied onto the view. */
export function describeGoogleAdsConnection(input: {
  env: Env;
  lastRun?: { status: string; mode: string; finishedAt: string | null; error: string | null } | null;
}): GoogleAdsConnectionView {
  const env = input.env;
  const enabled = googleAdsEnabled(env);
  const decision = decideGoogleAdsSync(env);
  const credentials = GOOGLE_ADS_REQUIRED.map((name) => ({
    id: CREDENTIAL_LABELS[name].id,
    label: CREDENTIAL_LABELS[name].label,
    present: Boolean((env[name] || "").trim()),
  }));
  const lastRun = input.lastRun ?? null;
  const exampleData = enabled && (env.MARKETING_SYNC_MODE || "").trim().toLowerCase() === "mock";
  const error = lastRun?.error ? redactGoogleSecrets(lastRun.error, secretsFrom(env)).slice(0, 300) : null;
  const lastSyncAt = lastRun?.finishedAt ?? null;

  const base = {
    enabled,
    exampleData,
    readOnly: true as const,
    credentials,
    lastSyncAt,
    error: exampleData ? null : error,
  };

  if (!enabled) {
    return {
      ...base,
      chip: "not_connected",
      chipLabel: "Not connected",
      summary: "Google Ads sync is off. Nothing is called, and no campaigns are pulled.",
      exampleData: false,
      error: null,
    };
  }

  if (exampleData) {
    return {
      ...base,
      chip: "connected",
      chipLabel: "Connected",
      summary: "Example data is on. These rows are fixtures so the dashboard can be reviewed. Google is not called.",
    };
  }

  if (decision.action === "skip") {
    const reason = decision.reason.startsWith("missing")
      ? "Add the developer token, OAuth client, refresh token, and login customer ID on the server. This page never asks for a password."
      : decision.reason === "GOOGLE_ADS_LOGIN_CUSTOMER_ID is not a 10-digit customer id"
        ? "The login customer ID needs to be the 10-digit manager account id. This page never asks for a password."
        : "Google Ads sync did not start. This page never asks for a password.";
    return {
      ...base,
      chip: "needs_attention",
      chipLabel: "Needs attention",
      summary: reason,
    };
  }

  if (lastRun?.status === "failed" || error) {
    return {
      ...base,
      chip: "needs_attention",
      chipLabel: "Needs attention",
      summary: "Google Ads did not finish the last read. Campaigns already stored are unchanged. Retry after the server credentials are checked.",
    };
  }

  if (lastRun?.status === "succeeded") {
    return {
      ...base,
      chip: "connected",
      chipLabel: "Connected",
      summary: "Connected. Campaigns, ads, and search terms update on the next sync.",
    };
  }

  return {
    ...base,
    chip: "needs_attention",
    chipLabel: "Needs attention",
    summary: "Credentials are set. The next sync will pull campaigns, ads, and search terms. Nothing is changed in Google Ads.",
  };
}

export async function loadGoogleAdsConnectionView(env: Env = process.env) {
  const { prisma } = await import("../db");
  const lastRun = await prisma.marketingSyncRun.findFirst({
    where: { workspaceId: WORKSPACE_ID, platform: "google_ads" },
    orderBy: { startedAt: "desc" },
    select: { status: true, mode: true, finishedAt: true, error: true },
  });
  return describeGoogleAdsConnection({
    env,
    lastRun: lastRun
      ? {
          status: lastRun.status,
          mode: lastRun.mode,
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          error: lastRun.error,
        }
      : null,
  });
}

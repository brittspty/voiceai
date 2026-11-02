import { chatgptAdsEnabled, type Env } from "../config";
import {
  applyConnectionTest,
  connectionFor,
  disconnectConnection,
  exampleRegistryState,
  openToken,
  type RegistryState,
} from "../channels/registry";
import { chatgptAdsRequest, redactAdsSecrets, type FetchLike } from "../connectors/chatgpt-ads-client";
import { recordChatgptAudit } from "./audit";

export const CHATGPT_ADS_PLATFORM = "chatgpt_ads";
export const CHATGPT_ADS_LABEL = "ChatGPT Ads";
export const CHATGPT_ADS_SETTINGS_URL = "https://ads.openai.com/settings";

export function canConnectChatgptAds(kind: string) {
  return kind === "super_admin" || kind === "account_manager" || kind === "staff" || kind === "client_owner";
}

export function canSetupChatgptAds(kind: string) {
  return kind === "super_admin" || kind === "account_manager";
}

export function connectGuide() {
  return {
    settingsUrl: CHATGPT_ADS_SETTINGS_URL,
    steps: [
      { title: "Open Ads Manager", body: "ChatGPT Ads keys are created in Ads Manager. This app cannot mint one." },
      { title: "Create a key for this ad account", body: "Each key belongs to one ad account. There is no read-only scope, so treat it like a write key." },
      { title: "Paste the key", body: "We check it with a read of the ad account, seal it with the channel registry, and show only the last 4 characters." },
    ],
  };
}

export type ConnectionView = {
  connected: boolean;
  status: "disconnected" | "connected" | "revoked";
  keyLast4: string;
  adAccountId: string;
  adAccountName: string;
  settingsUrl: string;
  steps: { title: string; body: string }[];
};

export function acceptableMockKey(apiKey: string) {
  const key = apiKey.trim();
  if (key.length < 20 || /\s/.test(key) || /invalid/i.test(key)) return false;
  return true;
}

function last4Of(tokenRef: string | null, env: Env) {
  if (!tokenRef) return "";
  try {
    return openToken(tokenRef, env).slice(-4);
  } catch {
    return "";
  }
}

export function presentChatgptConnection(state: RegistryState, clientId: string, env: Env = process.env): ConnectionView {
  const row = connectionFor(state, clientId, CHATGPT_ADS_PLATFORM);
  const guide = connectGuide();
  if (!row || row.state === "needs_setup") {
    return { connected: false, status: "disconnected", keyLast4: "", adAccountId: "", adAccountName: "", ...guide };
  }
  if (row.state === "disconnected") {
    return { connected: false, status: "revoked", keyLast4: "", adAccountId: row.accountId, adAccountName: "", ...guide };
  }
  return {
    connected: row.state === "connected",
    status: "connected",
    keyLast4: last4Of(row.tokenRef, env),
    adAccountId: row.accountId,
    adAccountName: row.accountId,
    ...guide,
  };
}

function accountIdOf(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" ? id : "";
}

export async function connectChatgptAds(input: {
  state?: RegistryState;
  env?: Env;
  actor: { id: string; kind: string };
  clientId: string;
  apiKey: string;
  mode?: "mock" | "live";
  fetchImpl?: FetchLike;
  log?: (line: string) => void;
  now?: string;
}) {
  const env = input.env ?? process.env;
  const state = input.state ?? exampleRegistryState();
  if (!chatgptAdsEnabled(env)) return { ok: false as const, status: 404, message: "ChatGPT Ads is off.", state };
  if (!canConnectChatgptAds(input.actor.kind)) return { ok: false as const, status: 403, message: "Only staff or the client owner can connect ChatGPT Ads.", state };
  const apiKey = input.apiKey.trim();
  const secrets = [apiKey];
  const mode = input.mode ?? ((env.CHATGPT_ADS_MODE || "").trim().toLowerCase() === "live" ? "live" : "mock");
  let accountId = "";
  let accepted = false;
  if (mode !== "live" && !acceptableMockKey(apiKey)) {
    input.log?.(redactAdsSecrets("ChatGPT Ads key was rejected before a read.", secrets));
  } else {
    const response = await chatgptAdsRequest({
      method: "GET",
      path: "/ad_account",
      apiKey,
      actor: "bot",
      env,
      mode,
      fetchImpl: input.fetchImpl,
      log: input.log,
    });
    accountId = response.ok ? accountIdOf(response.data) : "";
    accepted = response.ok && Boolean(accountId);
    if (!accepted) input.log?.(redactAdsSecrets("ChatGPT Ads key was rejected.", secrets));
    else input.log?.(redactAdsSecrets(`Confirmed ChatGPT Ads account ${accountId}.`, secrets));
  }
  const prior = connectionFor(state, input.clientId, CHATGPT_ADS_PLATFORM);
  const tested = applyConnectionTest(
    state,
    {
      clientId: input.clientId,
      platformKey: CHATGPT_ADS_PLATFORM,
      accountId: accountId || "unchecked",
      secret: accepted ? apiKey : undefined,
      outcome: accepted ? "success" : "error",
      now: input.now,
    },
    env,
  );
  if (!accepted || !tested.result?.saved) {
    return { ok: false as const, status: 400, message: "That key was rejected.", state: tested.state };
  }
  recordChatgptAudit({
    clientKey: input.clientId,
    actorId: input.actor.id,
    actorKind: input.actor.kind,
    action: prior?.state === "connected" ? "rotate" : "connect",
    detail: `${prior?.state === "connected" ? "Rotated" : "Connected"} ChatGPT Ads account ${accountId}. Key ending ${apiKey.slice(-4)}.`,
  });
  return { ok: true as const, status: 200, state: tested.state, view: presentChatgptConnection(tested.state, input.clientId, env) };
}

export function disconnectChatgptAds(input: {
  state: RegistryState;
  env?: Env;
  actor: { id: string; kind: string };
  clientId: string;
  confirm: boolean;
  dateLabel?: string;
}) {
  const env = input.env ?? process.env;
  if (!chatgptAdsEnabled(env)) return { ok: false as const, status: 404, message: "ChatGPT Ads is off.", state: input.state };
  if (!canConnectChatgptAds(input.actor.kind)) return { ok: false as const, status: 403, message: "Only staff or the client owner can disconnect ChatGPT Ads.", state: input.state };
  if (input.confirm !== true) return { ok: false as const, status: 400, message: "Confirm disconnect before the key is removed.", state: input.state };
  const result = disconnectConnection(input.state, {
    clientId: input.clientId,
    platformKey: CHATGPT_ADS_PLATFORM,
    confirmName: CHATGPT_ADS_LABEL,
    dateLabel: input.dateLabel || "Oct 31, 2026",
  });
  if (!result.ok) return { ok: false as const, status: 400, message: result.error, state: input.state };
  recordChatgptAudit({
    clientKey: input.clientId,
    actorId: input.actor.id,
    actorKind: input.actor.kind,
    action: "disconnect",
    detail: "Disconnected ChatGPT Ads. The sealed key was removed.",
  });
  return { ok: true as const, status: 200, state: result.state, view: presentChatgptConnection(result.state, input.clientId, env) };
}

/** Sealed registry key only. An environment Ads API key is not read. */
export function resolveChatgptAdsKey(state: RegistryState, clientId: string, env: Env = process.env) {
  const row = connectionFor(state, clientId, CHATGPT_ADS_PLATFORM);
  if (!row || row.state !== "connected" || !row.tokenRef) return null;
  try {
    return openToken(row.tokenRef, env);
  } catch {
    return null;
  }
}

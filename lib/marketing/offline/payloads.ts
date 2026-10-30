import type { Env } from "../config";
import { googleAdsApiVersion, graphVersion, normalizeCustomerId } from "../config";
import { zonedParts } from "../../time";
import type { ConversionPlatformName, EventRecord } from "./types";

/** Meta dataset / pixel id saved on the client. Not read from the environment. */
export function normalizeDatasetId(raw: string) {
  const value = raw.trim();
  return /^\d{6,20}$/.test(value) ? value : "";
}

export function metaCredentials(env: Env) {
  const accessToken = (env.META_CAPI_ACCESS_TOKEN || "").trim();
  if (!accessToken) return null;
  return { accessToken };
}

export function googleCredentials(env: Env) {
  const developerToken = (env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim();
  const accessToken = (env.GOOGLE_ADS_ACCESS_TOKEN || "").trim();
  const refreshToken = (env.GOOGLE_ADS_REFRESH_TOKEN || "").trim();
  const clientId = (env.GOOGLE_ADS_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_ADS_CLIENT_SECRET || "").trim();
  const rawLogin = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").trim();
  const loginCustomerId = rawLogin ? normalizeCustomerId(rawLogin) : "";
  if (!developerToken) return null;
  if (rawLogin && !loginCustomerId) return null;
  if (!accessToken && !(refreshToken && clientId && clientSecret)) return null;
  return { developerToken, accessToken, refreshToken, clientId, clientSecret, loginCustomerId };
}

/** Shared token is present. The client's own dataset or customer id is checked separately. */
export function platformReady(platform: ConversionPlatformName, env: Env) {
  return platform === "meta" ? Boolean(metaCredentials(env)) : Boolean(googleCredentials(env));
}

export function dollars(cents: number) {
  return Math.round(cents) / 100;
}

export function googleConversionDateTime(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), parts.hour, parts.minute, parts.second);
  const total = Math.round((asUtc - date.getTime()) / 60000);
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${hours}:${minutes}`;
}

export function googleConversionAction(action: string, customerId: string) {
  const trimmed = action.trim();
  const customer = normalizeCustomerId(customerId);
  if (/^customers\/\d{10}\/conversionActions\/\d+$/.test(trimmed)) return trimmed;
  if (customer && /^\d+$/.test(trimmed)) return `customers/${customer}/conversionActions/${trimmed}`;
  return trimmed;
}

export function googleActionReady(action: string, customerId: string) {
  const customer = normalizeCustomerId(customerId);
  const resolved = googleConversionAction(action, customer);
  return Boolean(customer) && resolved.startsWith(`customers/${customer}/`) && /^customers\/\d{10}\/conversionActions\/\d+$/.test(resolved);
}

export function buildMetaPayload(event: EventRecord, eventName: string) {
  const userData: Record<string, unknown> = {};
  if (event.emailHashMeta) userData.em = [event.emailHashMeta];
  if (event.phoneHashMeta) userData.ph = [event.phoneHashMeta];
  if (event.fbc) userData.fbc = event.fbc;
  if (event.fbp) userData.fbp = event.fbp;
  const custom: Record<string, unknown> = {};
  if (event.valueCents != null && event.valueCents > 0) {
    custom.value = dollars(event.valueCents);
    custom.currency = event.currency || "USD";
  }
  return {
    event_name: eventName,
    event_time: Math.floor(Date.parse(event.occurredAt) / 1000),
    event_id: event.id,
    action_source: "system_generated",
    user_data: userData,
    ...(Object.keys(custom).length ? { custom_data: custom } : {}),
  };
}

export function buildGooglePayload(event: EventRecord, action: string, customerId: string, timeZone: string) {
  const userIdentifiers = [
    event.emailHashGoogle ? { hashedEmail: event.emailHashGoogle } : null,
    event.phoneHashGoogle ? { hashedPhoneNumber: event.phoneHashGoogle } : null,
  ].filter((row) => row != null);
  const conversion: Record<string, unknown> = {
    conversionAction: googleConversionAction(action, customerId),
    conversionDateTime: googleConversionDateTime(new Date(event.occurredAt), timeZone),
    orderId: event.externalId,
  };
  if (userIdentifiers.length) conversion.userIdentifiers = userIdentifiers;
  if (event.gclid) conversion.gclid = event.gclid;
  else if (event.gbraid) conversion.gbraid = event.gbraid;
  else if (event.wbraid) conversion.wbraid = event.wbraid;
  if (event.valueCents != null && event.valueCents > 0) {
    conversion.conversionValue = dollars(event.valueCents);
    conversion.currencyCode = event.currency || "USD";
  }
  return { conversions: [conversion], partialFailure: true };
}

export function metaMatchable(event: EventRecord) {
  return Boolean(event.fbc || event.fbp || event.fbclid || event.emailHashMeta || event.phoneHashMeta);
}

export function googleMatchable(event: EventRecord) {
  return Boolean(event.gclid || event.gbraid || event.wbraid || event.emailHashGoogle || event.phoneHashGoogle);
}

export function matchable(platform: ConversionPlatformName, event: EventRecord) {
  return platform === "meta" ? metaMatchable(event) : googleMatchable(event);
}

export function metaEventsUrl(env: Env, datasetId: string) {
  const dataset = normalizeDatasetId(datasetId);
  if (!dataset) return "";
  return `https://graph.facebook.com/${graphVersion(env)}/${dataset}/events`;
}

export function googleUploadUrl(env: Env, customerId: string) {
  const customer = normalizeCustomerId(customerId);
  if (!customer) return "";
  return `https://googleads.googleapis.com/${googleAdsApiVersion(env)}/customers/${customer}:uploadClickConversions`;
}

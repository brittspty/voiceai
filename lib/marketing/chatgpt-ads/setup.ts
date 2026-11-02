import type { Env } from "../config";
import { chatgptAdsEnabled } from "../config";
import { chatgptAdsRequest, type ChatgptAdsCapture, type FetchLike } from "../connectors/chatgpt-ads-client";
import { recordChatgptAudit } from "./audit";

export type ChatgptActor = { id: string; kind: string };

export const CHATGPT_PLATFORMS = ["android_app", "android_web", "desktop_web", "ios_app", "ios_web", "web"] as const;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const FILE_ID = /^file_[A-Za-z0-9_-]{1,80}$/;

export type WizardDraft = {
  campaignName: string;
  description?: string;
  lifetimeSpendLimitMicros: number;
  locations?: string[];
  platforms?: string[];
  audienceInclude?: string[];
  audienceExclude?: string[];
  adGroupName: string;
  contextHints?: string[];
  maxBidMicros: number;
  billingEvent?: "impression" | "click";
  adName: string;
  title: string;
  body: string;
  imageFileId: string;
  link: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

const BUDGET_KEY = /spend|budget|bid|micros|cpc|cpm|cpa|cpl|roas|cost/i;

export function stripBudgetKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripBudgetKeys);
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (BUDGET_KEY.test(key)) continue;
    next[key] = stripBudgetKeys(child);
  }
  return next;
}

/** Copy and targeting only. Budget and bid fields are dropped even if a caller stuffed them in. */
export function suggestChatgptCreative(input: { product?: string; audience?: string; platforms?: string[] }) {
  const cleaned = stripBudgetKeys(input) as { product?: string; audience?: string; platforms?: string[] };
  const product = oneLine(cleaned.product) || "your offer";
  const audience = oneLine(cleaned.audience) || "people comparing options";
  const title = `See ${product}`.slice(0, 50);
  const body = `A chat card for ${audience}.`.slice(0, 100);
  const platforms = (cleaned.platforms ?? ["web"]).filter((item) => (CHATGPT_PLATFORMS as readonly string[]).includes(item));
  return stripBudgetKeys({
    title: title.length >= 3 ? title : "See this offer",
    body: body.length > 0 ? body : "Learn more in chat.",
    contextHints: [audience].filter((hint) => hint.length >= 3).slice(0, 8),
    platforms: platforms.length ? platforms : ["web"],
  });
}

function oneLine(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function named(value: string, label: string, min: number, max: number) {
  const text = oneLine(value);
  if (text.length < min || text.length > max || !/\S/.test(text)) return `${label} needs ${min} to ${max} characters.`;
  return null;
}

function idList(values: string[] | undefined, label: string) {
  const ids = (values ?? []).map((item) => item.trim()).filter(Boolean);
  if (ids.some((item) => !ID.test(item))) return { ok: false as const, message: `${label} ids are not valid.` };
  return { ok: true as const, ids };
}

function integer(value: unknown, label: string, min: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return { ok: false as const, message: `${label} must be a whole number of at least ${min}.` };
  return { ok: true as const, value: parsed };
}

export function withUtms(link: string, draft: Pick<WizardDraft, "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm">) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { ok: false as const, message: "The ad link must be an https URL." };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { ok: false as const, message: "The ad link must be an https URL." };
  const pairs: [string, string | undefined][] = [
    ["utm_source", draft.utmSource],
    ["utm_medium", draft.utmMedium],
    ["utm_campaign", draft.utmCampaign],
    ["utm_content", draft.utmContent],
    ["utm_term", draft.utmTerm],
  ];
  for (const [key, value] of pairs) {
    const text = oneLine(value);
    if (text) url.searchParams.set(key, text.slice(0, 80));
  }
  return { ok: true as const, url: url.toString() };
}

export function buildPausedCampaign(draft: WizardDraft) {
  const name = named(draft.campaignName, "Campaign name", 3, 1000);
  if (name) return { ok: false as const, message: name };
  const limit = integer(draft.lifetimeSpendLimitMicros, "Lifetime spend limit", 1_000_000);
  if (!limit.ok) return limit;
  const locations = idList(draft.locations, "Location");
  if (!locations.ok) return locations;
  const include = idList(draft.audienceInclude, "Audience");
  if (!include.ok) return include;
  const exclude = idList(draft.audienceExclude, "Excluded audience");
  if (!exclude.ok) return exclude;
  const platforms = (draft.platforms ?? []).map((item) => item.trim()).filter(Boolean);
  if (platforms.some((item) => !(CHATGPT_PLATFORMS as readonly string[]).includes(item))) {
    return { ok: false as const, message: "Platform must be one of the ChatGPT app or web values." };
  }
  const targeting: Record<string, unknown> = {};
  if (locations.ids.length) targeting.locations = { include: locations.ids.map((id) => ({ id })) };
  if (platforms.length) targeting.platforms = { included: platforms };
  if (include.ids.length) targeting.custom_audiences = { ids: include.ids };
  if (exclude.ids.length) targeting.excluded_custom_audiences = { ids: exclude.ids };
  return {
    ok: true as const,
    body: {
      name: oneLine(draft.campaignName),
      description: oneLine(draft.description) || undefined,
      status: "paused",
      budget: { lifetime_spend_limit_micros: limit.value },
      ...(Object.keys(targeting).length ? { targeting } : {}),
    },
  };
}

export function buildPausedAdGroup(draft: WizardDraft, campaignId: string) {
  if (!ID.test(campaignId)) return { ok: false as const, message: "Campaign id is not valid." };
  const name = named(draft.adGroupName, "Ad group name", 3, 1000);
  if (name) return { ok: false as const, message: name };
  const bid = integer(draft.maxBidMicros, "Max bid", 1);
  if (!bid.ok) return bid;
  const hints = (draft.contextHints ?? []).map((hint) => oneLine(hint)).filter(Boolean).slice(0, 12);
  if (hints.some((hint) => hint.length > 80)) return { ok: false as const, message: "Context hints are limited to 80 characters." };
  const billing = draft.billingEvent === "click" ? "click" : "impression";
  return {
    ok: true as const,
    body: {
      campaign_id: campaignId,
      name: oneLine(draft.adGroupName),
      status: "paused",
      context_hints: hints,
      bidding_config: { billing_event_type: billing, max_bid_micros: bid.value },
    },
  };
}

export function buildPausedAd(draft: WizardDraft, adGroupId: string) {
  if (!ID.test(adGroupId)) return { ok: false as const, message: "Ad group id is not valid." };
  const name = named(draft.adName, "Ad name", 3, 1000);
  if (name) return { ok: false as const, message: name };
  const title = named(draft.title, "Title", 3, 50);
  if (title) return { ok: false as const, message: title };
  const body = oneLine(draft.body);
  if (!body || body.length > 100) return { ok: false as const, message: "Body can be at most 100 characters." };
  if (!FILE_ID.test(draft.imageFileId.trim())) return { ok: false as const, message: "Image needs a file id from Ads Manager." };
  const link = withUtms(draft.link, draft);
  if (!link.ok) return link;
  return {
    ok: true as const,
    body: {
      ad_group_id: adGroupId,
      name: oneLine(draft.adName),
      status: "paused",
      creative: {
        type: "chat_card",
        title: oneLine(draft.title),
        body,
        target_url: link.url,
        file_id: draft.imageFileId.trim(),
      },
    },
  };
}

export function buildLaunch(input: { entity: "campaign" | "ad_group" | "ad"; id: string; confirmed: boolean }) {
  if (input.confirmed !== true) return { ok: false as const, message: "Confirm launch before this can go live." };
  if (!ID.test(input.id)) return { ok: false as const, message: "That id is not valid." };
  const collection = input.entity === "ad_group" ? "ad_groups" : input.entity === "ad" ? "ads" : "campaigns";
  return { ok: true as const, path: `/${collection}/${input.id}/activate` };
}

function statusOf(data: unknown) {
  return data && typeof data === "object" && "status" in data ? String((data as { status?: unknown }).status) : "";
}

function idOf(data: unknown) {
  return data && typeof data === "object" && typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : "";
}

export async function createPausedChatgptAds(input: {
  env?: Env;
  actor: ChatgptActor;
  apiKey: string;
  staffGrant?: symbol;
  draft: WizardDraft;
  clientKey: string;
  mode?: "mock" | "live";
  fetchImpl?: FetchLike;
  log?: (line: string) => void;
  capture?: ChatgptAdsCapture[];
}) {
  if (!chatgptAdsEnabled(input.env ?? process.env)) return { ok: false as const, status: 404, message: "ChatGPT Ads is off." };
  if (input.actor.kind !== "super_admin" && input.actor.kind !== "account_manager") {
    return { ok: false as const, status: 403, message: "Only a super admin or account manager can create ChatGPT Ads." };
  }
  const campaign = buildPausedCampaign(input.draft);
  if (!campaign.ok) return { ok: false as const, status: 400, message: campaign.message };
  const createdCampaign = await chatgptAdsRequest({
    method: "POST",
    path: "/campaigns",
    body: campaign.body,
    apiKey: input.apiKey,
    actor: "staff",
    staffGrant: input.staffGrant,
    env: input.env,
    mode: input.mode,
    fetchImpl: input.fetchImpl,
    log: input.log,
    capture: input.capture,
  });
  if (!createdCampaign.ok) return { ok: false as const, status: createdCampaign.status || 502, message: createdCampaign.message };
  if (statusOf(createdCampaign.data) !== "paused") return { ok: false as const, status: 502, message: "The campaign was not created paused." };
  const campaignId = idOf(createdCampaign.data);
  const adGroup = buildPausedAdGroup(input.draft, campaignId);
  if (!adGroup.ok) return { ok: false as const, status: 400, message: adGroup.message };
  const createdGroup = await chatgptAdsRequest({
    method: "POST",
    path: "/ad_groups",
    body: adGroup.body,
    apiKey: input.apiKey,
    actor: "staff",
    staffGrant: input.staffGrant,
    env: input.env,
    mode: input.mode,
    fetchImpl: input.fetchImpl,
    log: input.log,
    capture: input.capture,
  });
  if (!createdGroup.ok) return { ok: false as const, status: createdGroup.status || 502, message: createdGroup.message };
  if (statusOf(createdGroup.data) !== "paused") return { ok: false as const, status: 502, message: "The ad group was not created paused." };
  const adGroupId = idOf(createdGroup.data);
  const ad = buildPausedAd(input.draft, adGroupId);
  if (!ad.ok) return { ok: false as const, status: 400, message: ad.message };
  const createdAd = await chatgptAdsRequest({
    method: "POST",
    path: "/ads",
    body: ad.body,
    apiKey: input.apiKey,
    actor: "staff",
    staffGrant: input.staffGrant,
    env: input.env,
    mode: input.mode,
    fetchImpl: input.fetchImpl,
    log: input.log,
    capture: input.capture,
  });
  if (!createdAd.ok) return { ok: false as const, status: createdAd.status || 502, message: createdAd.message };
  if (statusOf(createdAd.data) !== "paused") return { ok: false as const, status: 502, message: "The ad was not created paused." };
  recordChatgptAudit({
    clientKey: input.clientKey,
    actorId: input.actor.id,
    actorKind: input.actor.kind,
    action: "create",
    detail: `Created paused campaign ${oneLine(input.draft.campaignName)}, ad group ${oneLine(input.draft.adGroupName)}, and chat card ${oneLine(input.draft.adName)}. Budget and bid were entered on the staff form.`,
  });
  return {
    ok: true as const,
    status: 200,
    campaignId,
    adGroupId,
    adId: idOf(createdAd.data),
    statuses: ["paused", "paused", "paused"],
  };
}

export async function launchChatgptAds(input: {
  env?: Env;
  actor: ChatgptActor;
  apiKey: string;
  staffGrant?: symbol;
  entity: "campaign" | "ad_group" | "ad";
  id: string;
  confirmed: boolean;
  clientKey: string;
  mode?: "mock" | "live";
  fetchImpl?: FetchLike;
  log?: (line: string) => void;
  capture?: ChatgptAdsCapture[];
}) {
  if (!chatgptAdsEnabled(input.env ?? process.env)) return { ok: false as const, status: 404, message: "ChatGPT Ads is off." };
  if (input.actor.kind !== "super_admin" && input.actor.kind !== "account_manager") {
    return { ok: false as const, status: 403, message: "Launch is limited to a super admin or account manager." };
  }
  const launch = buildLaunch({ entity: input.entity, id: input.id, confirmed: input.confirmed });
  if (!launch.ok) return { ok: false as const, status: 400, message: launch.message };
  const response = await chatgptAdsRequest({
    method: "POST",
    path: launch.path,
    body: {},
    apiKey: input.apiKey,
    actor: "staff",
    staffGrant: input.staffGrant,
    env: input.env,
    mode: input.mode,
    fetchImpl: input.fetchImpl,
    log: input.log,
    capture: input.capture,
  });
  if (!response.ok) return { ok: false as const, status: response.status || 502, message: response.message };
  if (statusOf(response.data) !== "active") return { ok: false as const, status: 502, message: "Launch did not activate the object." };
  recordChatgptAudit({
    clientKey: input.clientKey,
    actorId: input.actor.id,
    actorKind: input.actor.kind,
    action: "launch",
    detail: `Staff confirmed launch for ${input.entity} ${input.id}.`,
  });
  return { ok: true as const, status: 200, id: input.id, statusText: "active" };
}

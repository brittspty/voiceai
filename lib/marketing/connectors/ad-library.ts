import { assertNoAdBudgetWrite } from "./budget-lock";
import { appSecretProof, redactSecrets } from "./meta-client";
import { asRecord, str } from "./meta-map";
import type { FetchLike } from "./meta-client";

/** Public creative fields. Spend, delivery estimates, and audience size are not requested. */
export const AD_LIBRARY_FIELDS = [
  "id",
  "ad_creation_time",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "page_id",
  "page_name",
  "ad_snapshot_url",
  "publisher_platforms",
] as const;

export type PublicAd = {
  externalId: string;
  source: "meta_ad_library";
  pageName: string;
  pageId: string;
  headline: string;
  body: string;
  snapshotUrl: string;
  firstSeen: string;
  lastSeen: string;
  active: boolean;
  creative: Record<string, unknown>;
};

export function adLibraryUrl(input: {
  version: string;
  token: string;
  appSecret?: string;
  countries: string[];
  searchTerms?: string;
  pageIds?: string[];
  limit?: number;
}) {
  const url = new URL(`https://graph.facebook.com/${input.version}/ads_archive`);
  url.searchParams.set("access_token", input.token);
  if ((input.appSecret || "").trim()) {
    url.searchParams.set("appsecret_proof", appSecretProof(input.token, input.appSecret!.trim()));
  }
  url.searchParams.set("ad_reached_countries", JSON.stringify(input.countries));
  url.searchParams.set("ad_active_status", "ALL");
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("fields", AD_LIBRARY_FIELDS.join(","));
  url.searchParams.set("limit", String(Math.min(50, Math.max(1, input.limit ?? 25))));
  const terms = (input.searchTerms || "").trim();
  if (terms) url.searchParams.set("search_terms", terms);
  const pages = (input.pageIds || []).map((id) => id.trim()).filter(Boolean);
  if (pages.length) url.searchParams.set("search_page_ids", JSON.stringify(pages));
  return url;
}

function listOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function day(value: string, fallback: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : fallback;
}

export function mapAdLibraryAds(payload: unknown, now = new Date()): PublicAd[] {
  const data = asRecord(payload).data;
  if (!Array.isArray(data)) return [];
  const today = now.toISOString().slice(0, 10);
  const ads: PublicAd[] = [];
  for (const item of data) {
    const record = asRecord(item);
    const externalId = str(record.id);
    if (!externalId) continue;
    const titles = listOf(record.ad_creative_link_titles);
    const bodies = listOf(record.ad_creative_bodies);
    const descriptions = listOf(record.ad_creative_link_descriptions);
    const platforms = listOf(record.publisher_platforms);
    const start = day(str(record.ad_delivery_start_time) || str(record.ad_creation_time), today);
    const stop = str(record.ad_delivery_stop_time);
    const snapshot = str(record.ad_snapshot_url) || `https://www.facebook.com/ads/library/?id=${externalId}`;
    const creative: Record<string, unknown> = {
      page_name: str(record.page_name),
      page_id: str(record.page_id),
      headline: titles[0] || "",
      body: bodies[0] || "",
      description: descriptions[0] || "",
      delivery_start: start,
      delivery_stop: stop || null,
      snapshot_url: snapshot,
      platforms,
      source: "meta_ad_library",
    };
    ads.push({
      externalId,
      source: "meta_ad_library",
      pageName: str(record.page_name),
      pageId: str(record.page_id),
      headline: titles[0] || bodies[0]?.slice(0, 80) || "Ad",
      body: bodies[0] || descriptions[0] || "",
      snapshotUrl: snapshot,
      firstSeen: start,
      lastSeen: stop ? day(stop, today) : today,
      active: !stop,
      creative,
    });
  }
  return ads;
}

export function competitorCopyIsPublic(text: string) {
  return !/spend|budget|cpa|cpc|cpm|roas|impression|revenue|\$/i.test(text);
}

export async function fetchAdLibraryAds(input: {
  version: string;
  token: string;
  appSecret?: string;
  countries: string[];
  searchTerms?: string;
  pageIds?: string[];
  competitorName: string;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<{ ok: true; ads: PublicAd[] } | { ok: false; message: string }> {
  const terms = (input.searchTerms || "").trim();
  const pageIds = (input.pageIds || []).map((id) => id.trim()).filter(Boolean);
  if (!terms && !pageIds.length) {
    return { ok: false, message: `Couldn't load ads for ${input.competitorName}. Add a Facebook page or search words.` };
  }
  if (!input.token.trim()) {
    return { ok: false, message: `Couldn't load ads for ${input.competitorName}. Ad Library is not connected.` };
  }
  const url = adLibraryUrl(input);
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    assertNoAdBudgetWrite({ method: "GET", url: url.toString() });
    const response = await fetchImpl(url.toString(), { method: "GET" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = str(asRecord(asRecord(body).error).message) || "Their page may be private.";
      return {
        ok: false,
        message: redactSecrets(`Couldn't load ads for ${input.competitorName}. ${message}`, [input.token, input.appSecret || ""]),
      };
    }
    return { ok: true, ads: mapAdLibraryAds(body, input.now) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Their page may be private.";
    return {
      ok: false,
      message: redactSecrets(`Couldn't load ads for ${input.competitorName}. ${message}`, [input.token, input.appSecret || ""]),
    };
  }
}

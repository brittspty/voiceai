import { conceptKey, creativeFingerprint } from "../creative";
import { decimalString, intString, minorToMajor } from "../money";
import {
  ALL_SEGMENT,
  emptySnapshot,
  type AdPlatform,
  type AudienceType,
  type BudgetType,
  type CampaignObjective,
  type CreativeFormat,
  type EntityStatus,
  type NormalizedSnapshot,
} from "../types";

export type MetaBundle = {
  account: unknown;
  campaigns: unknown[];
  adsets: unknown[];
  ads: unknown[];
  audiences: unknown[];
  insights: unknown[];
  warnings?: string[];
};

const LEAD_ACTIONS = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "leadgen.other",
]);

const CONVERSION_ACTIONS = new Set([
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "subscribe",
  "submit_application",
  "schedule",
  "contact",
]);

const OBJECTIVES: Record<string, CampaignObjective> = {
  OUTCOME_LEADS: "leads",
  LEAD_GENERATION: "leads",
  OUTCOME_TRAFFIC: "traffic",
  LINK_CLICKS: "traffic",
  OUTCOME_SALES: "conversions",
  CONVERSIONS: "conversions",
  PRODUCT_CATALOG_SALES: "conversions",
  OUTCOME_AWARENESS: "awareness",
  BRAND_AWARENESS: "awareness",
  REACH: "awareness",
  OUTCOME_CALLS: "calls",
};

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function str(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function mapMetaObjective(raw: string): CampaignObjective {
  return OBJECTIVES[raw.trim().toUpperCase()] ?? "other";
}

export function mapMetaStatus(raw: string): EntityStatus {
  const key = raw.trim().toUpperCase();
  if (key === "ACTIVE") return "active";
  if (key === "PAUSED" || key === "CAMPAIGN_PAUSED" || key === "ADSET_PAUSED") return "paused";
  if (key === "ARCHIVED") return "archived";
  if (key === "DELETED") return "deleted";
  return "unknown";
}

export function mapMetaAccountStatus(raw: unknown): EntityStatus {
  const numeric = typeof raw === "number" ? raw : Number(raw);
  if (numeric === 1) return "active";
  if (numeric === 2 || numeric === 3 || numeric === 9) return "paused";
  if (numeric === 100 || numeric === 101 || numeric === 102) return "deleted";
  if (typeof raw === "string" && raw.trim()) return mapMetaStatus(raw);
  return "unknown";
}

export function mapBudget(record: Record<string, unknown>, currency: string): { budgetType: BudgetType; budgetAmount: string | null } {
  const daily = str(record.daily_budget);
  const lifetime = str(record.lifetime_budget);
  if (daily && Number(daily) > 0) return { budgetType: "daily", budgetAmount: minorToMajor(daily, currency) };
  if (lifetime && Number(lifetime) > 0) return { budgetType: "lifetime", budgetAmount: minorToMajor(lifetime, currency) };
  return { budgetType: "none", budgetAmount: null };
}

type ActionRow = { action_type: string; value: string };

export function actionRows(value: unknown): ActionRow[] {
  if (!Array.isArray(value)) return [];
  const rows: ActionRow[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const actionType = str(record.action_type);
    if (!actionType) continue;
    rows.push({ action_type: actionType, value: str(record.value) || "0" });
  }
  return rows;
}

/**
 * Meta often returns the same leads under several action types.
 * Take the max so those buckets are not added together.
 */
export function mapPlatformLeads(actions: ActionRow[]) {
  let max = 0;
  for (const action of actions) {
    if (!LEAD_ACTIONS.has(action.action_type)) continue;
    const amount = Number(action.value);
    if (Number.isFinite(amount) && amount > max) max = amount;
  }
  return decimalString(max);
}

/** Distinct conversion events are summed. Lead actions are excluded. */
export function mapPlatformConversions(actions: ActionRow[]) {
  let sum = 0;
  for (const action of actions) {
    if (!CONVERSION_ACTIONS.has(action.action_type)) continue;
    const amount = Number(action.value);
    if (Number.isFinite(amount)) sum += amount;
  }
  return decimalString(sum);
}

export function mapConversionValue(actions: ActionRow[]) {
  let sum = 0;
  for (const action of actions) {
    if (!CONVERSION_ACTIONS.has(action.action_type)) continue;
    const amount = Number(action.value);
    if (Number.isFinite(amount)) sum += amount;
  }
  return decimalString(sum);
}

export function mapVideoViews3s(actions: ActionRow[]) {
  const row = actions.find((action) => action.action_type === "video_view");
  return row ? intString(row.value) : null;
}

export function mapThruplays(value: unknown) {
  const rows = actionRows(value);
  if (!rows.length) return null;
  const sum = rows.reduce((total, row) => total + (Number(row.value) || 0), 0);
  return intString(sum);
}

function mapAudienceType(subtype: string): AudienceType {
  const key = subtype.trim().toUpperCase();
  if (key === "LOOKALIKE" || key.includes("LOOKALIKE")) return "lookalike";
  if (key === "CUSTOM" || key === "APP") return "custom_list";
  if (key === "WEBSITE" || key === "ENGAGEMENT" || key === "IG_BUSINESS") return "retargeting";
  return "unknown";
}

function mapFormat(input: { videoId: string; imageHash: string; childCount: number; leadForm: string }): CreativeFormat {
  if (input.leadForm) return "lead_form";
  if (input.childCount > 1) return "carousel";
  if (input.videoId) return "video";
  if (input.imageHash) return "image";
  return "unknown";
}

function parseTime(value: unknown) {
  const raw = str(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function accountExternalId(account: Record<string, unknown>) {
  const id = str(account.id);
  if (id.startsWith("act_")) return id;
  const numeric = str(account.account_id) || id;
  return numeric ? `act_${numeric.replace(/^act_/, "")}` : "";
}

function sizeEstimate(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.min(Math.round(amount), 2_000_000_000);
}

function extractCreative(ad: Record<string, unknown>) {
  const creative = asRecord(ad.creative);
  const spec = asRecord(creative.object_story_spec);
  const link = asRecord(spec.link_data);
  const video = asRecord(spec.video_data);
  const linkCta = asRecord(link.call_to_action);
  const videoCta = asRecord(video.call_to_action);
  const cta = str(linkCta.type) ? linkCta : videoCta;
  const ctaValue = asRecord(cta.value);
  const children = Array.isArray(link.child_attachments) ? link.child_attachments.length : 0;
  const videoId = str(video.video_id) || str(creative.video_id);
  const imageHash = str(link.image_hash) || str(creative.image_hash);
  const headline = str(link.name) || str(video.title) || str(creative.title);
  const body = str(link.message) || str(video.message) || str(creative.body);
  const description = str(link.description) || str(video.link_description);
  const ctaType = str(cta.type) || str(creative.call_to_action_type);
  const landing = str(link.link) || str(ctaValue.link);
  const leadForm = str(creative.lead_gen_form_id) || str(link.lead_gen_form_id);
  const mediaRef = videoId || imageHash;
  const adId = str(ad.id);
  const blank = !headline && !body && !description && !ctaType && !mediaRef && !landing;
  const fingerprint = creativeFingerprint({
    headline,
    body,
    description,
    cta: ctaType,
    mediaRef: blank ? `ad:${adId}` : mediaRef,
    landingUrl: landing,
  });
  const name = str(creative.name) || str(ad.name) || "Untitled creative";
  return {
    externalId: str(creative.id) || adId,
    name,
    format: mapFormat({ videoId, imageHash, childCount: children, leadForm }),
    fingerprint,
    headline,
    body,
    description,
    cta: ctaType,
    mediaRef: blank ? `ad:${adId}` : mediaRef,
    landingUrl: landing,
    urlTags: str(creative.url_tags),
    conceptKey: conceptKey(name, mediaRef, fingerprint),
  };
}

function targetingAudiences(adset: Record<string, unknown>, role: "include" | "exclude") {
  const targeting = asRecord(adset.targeting);
  const key = role === "include" ? "custom_audiences" : "excluded_custom_audiences";
  const list = Array.isArray(targeting[key]) ? targeting[key] : [];
  const rows: { id: string; name: string }[] = [];
  for (const item of list) {
    const record = asRecord(item);
    const id = str(record.id);
    if (!id) continue;
    rows.push({ id, name: str(record.name) || id });
  }
  return rows;
}

export function normalizeMetaBundle(
  bundle: MetaBundle,
  options: { attributionWindow: string; platform?: AdPlatform },
): NormalizedSnapshot {
  const platform = options.platform ?? "meta";
  const snapshot = emptySnapshot();
  snapshot.warnings.push(...(bundle.warnings ?? []));
  snapshot.segments.push(ALL_SEGMENT);

  const account = asRecord(bundle.account);
  const accountId = accountExternalId(account);
  if (!accountId) {
    snapshot.warnings.push("Meta account payload had no id");
    return snapshot;
  }
  const currency = (str(account.currency) || "USD").toUpperCase().slice(0, 3);
  const timezone = str(account.timezone_name) || "UTC";
  snapshot.accounts.push({
    platform,
    externalId: accountId,
    name: str(account.name) || accountId,
    currency,
    timezone,
    status: mapMetaAccountStatus(account.account_status),
    syncEnabled: true,
  });
  snapshot.raw.push({ platform, objectType: "ad_account", externalId: accountId, payload: bundle.account });

  const campaignIds = new Set<string>();
  for (const item of bundle.campaigns) {
    const record = asRecord(item);
    const externalId = str(record.id);
    if (!externalId || campaignIds.has(externalId)) continue;
    campaignIds.add(externalId);
    const statusRaw = str(record.effective_status) || str(record.status);
    const budget = mapBudget(record, currency);
    snapshot.campaigns.push({
      platform,
      accountExternalId: accountId,
      externalId,
      name: str(record.name) || externalId,
      objective: mapMetaObjective(str(record.objective)),
      objectiveRaw: str(record.objective),
      status: mapMetaStatus(statusRaw),
      statusRaw,
      budgetType: budget.budgetType,
      budgetAmount: budget.budgetAmount,
      startDate: parseTime(record.start_time),
      endDate: parseTime(record.stop_time),
      namingParsed: {},
    });
    snapshot.raw.push({ platform, objectType: "campaign", externalId, payload: item });
  }

  const adGroupIds = new Set<string>();
  for (const item of bundle.adsets) {
    const record = asRecord(item);
    const externalId = str(record.id);
    const campaignExternalId = str(record.campaign_id);
    if (!externalId || adGroupIds.has(externalId)) continue;
    if (!campaignIds.has(campaignExternalId)) {
      snapshot.warnings.push(`Ad set ${externalId} references unknown campaign ${campaignExternalId || "(missing)"}`);
      continue;
    }
    adGroupIds.add(externalId);
    const statusRaw = str(record.effective_status) || str(record.status);
    snapshot.adGroups.push({
      platform,
      campaignExternalId,
      externalId,
      name: str(record.name) || externalId,
      status: mapMetaStatus(statusRaw),
      statusRaw,
      optimizationGoal: str(record.optimization_goal),
      bidStrategy: str(record.bid_strategy),
    });
    snapshot.raw.push({ platform, objectType: "ad_group", externalId, payload: item });
    for (const role of ["include", "exclude"] as const) {
      for (const audience of targetingAudiences(record, role)) {
        snapshot.adGroupAudiences.push({
          platform,
          adGroupExternalId: externalId,
          audienceExternalId: audience.id,
          role,
        });
      }
    }
  }

  const adIds = new Set<string>();
  const creativeByFingerprint = new Map<string, (typeof snapshot.creatives)[number]>();
  for (const item of bundle.ads) {
    const record = asRecord(item);
    const externalId = str(record.id);
    const adGroupExternalId = str(record.adset_id);
    if (!externalId || adIds.has(externalId)) continue;
    if (!adGroupIds.has(adGroupExternalId)) {
      snapshot.warnings.push(`Ad ${externalId} references unknown ad set ${adGroupExternalId || "(missing)"}`);
      continue;
    }
    adIds.add(externalId);
    const creative = extractCreative(record);
    const statusRaw = str(record.effective_status) || str(record.status);
    const existing = creativeByFingerprint.get(creative.fingerprint);
    if (existing) {
      if (!existing.platformCreativeIds.some((ref) => ref.externalId === creative.externalId)) {
        existing.platformCreativeIds.push({ platform, externalId: creative.externalId });
      }
    } else {
      const row = {
        conceptKey: creative.conceptKey,
        name: creative.name,
        conceptTag: "",
        format: creative.format,
        angle: "",
        offer: "",
        hook: "",
        fingerprint: creative.fingerprint,
        headline: creative.headline,
        body: creative.body,
        description: creative.description,
        cta: creative.cta,
        mediaRef: creative.mediaRef,
        landingUrl: creative.landingUrl,
        platformCreativeIds: [{ platform, externalId: creative.externalId }],
      };
      creativeByFingerprint.set(creative.fingerprint, row);
      snapshot.creatives.push(row);
    }
    snapshot.ads.push({
      platform,
      adGroupExternalId,
      externalId,
      name: str(record.name) || externalId,
      status: mapMetaStatus(statusRaw),
      statusRaw,
      fingerprint: creative.fingerprint,
      destinationUrl: creative.landingUrl,
      urlTags: creative.urlTags,
    });
    snapshot.raw.push({ platform, objectType: "ad", externalId, payload: item });
    if (creative.externalId) {
      snapshot.raw.push({ platform, objectType: "creative", externalId: creative.externalId, payload: asRecord(record.creative) });
    }
  }

  const audienceIds = new Set<string>();
  for (const item of bundle.audiences) {
    const record = asRecord(item);
    const externalId = str(record.id);
    if (!externalId || audienceIds.has(externalId)) continue;
    audienceIds.add(externalId);
    snapshot.audiences.push({
      platform,
      accountExternalId: accountId,
      externalId,
      name: str(record.name) || externalId,
      type: mapAudienceType(str(record.subtype)),
      sourceDescription: str(record.description),
      sizeEstimate: sizeEstimate(record.approximate_count_lower_bound),
    });
    snapshot.raw.push({ platform, objectType: "audience", externalId, payload: item });
  }
  for (const link of snapshot.adGroupAudiences) {
    if (audienceIds.has(link.audienceExternalId)) continue;
    audienceIds.add(link.audienceExternalId);
    snapshot.audiences.push({
      platform,
      accountExternalId: accountId,
      externalId: link.audienceExternalId,
      name: link.audienceExternalId,
      type: "custom_list",
      sourceDescription: "Referenced by ad set targeting",
      sizeEstimate: null,
    });
  }

  const metricKeys = new Set<string>();
  for (const item of bundle.insights) {
    const record = asRecord(item);
    const adExternalId = str(record.ad_id);
    const date = str(record.date_start).slice(0, 10);
    if (!adExternalId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!adIds.has(adExternalId)) {
      snapshot.warnings.push(`Insight for unknown ad ${adExternalId} on ${date} was skipped`);
      continue;
    }
    const key = `${date}|${adExternalId}|${options.attributionWindow}`;
    if (metricKeys.has(key)) continue;
    metricKeys.add(key);
    const actions = actionRows(record.actions);
    const values = actionRows(record.action_values);
    snapshot.metrics.push({
      platform,
      date,
      adExternalId,
      campaignExternalId: str(record.campaign_id),
      adGroupExternalId: str(record.adset_id),
      fingerprint: snapshot.ads.find((ad) => ad.externalId === adExternalId)?.fingerprint ?? "",
      segmentKey: ALL_SEGMENT.segmentKey,
      segmentKind: ALL_SEGMENT.kind,
      attributionWindow: options.attributionWindow,
      currency,
      spend: decimalString(str(record.spend) || "0"),
      impressions: intString(record.impressions),
      clicks: intString(record.clicks),
      linkClicks: intString(record.inline_link_clicks),
      reach: intString(record.reach),
      platformLeads: mapPlatformLeads(actions),
      platformConversions: mapPlatformConversions(actions),
      conversionValue: mapConversionValue(values),
      videoViews3s: mapVideoViews3s(actions),
      thruplays: mapThruplays(record.video_thruplay_watched_actions),
    });
    snapshot.raw.push({
      platform,
      objectType: "insight",
      externalId: `${adExternalId}|${date}|${options.attributionWindow}`,
      payload: item,
    });
  }

  return snapshot;
}

export function mergeSnapshots(parts: NormalizedSnapshot[]): NormalizedSnapshot {
  const merged = emptySnapshot();
  const metricKeys = new Set<string>();
  const entityKeys = {
    accounts: new Set<string>(),
    campaigns: new Set<string>(),
    adGroups: new Set<string>(),
    ads: new Set<string>(),
    audiences: new Set<string>(),
    links: new Set<string>(),
    raw: new Set<string>(),
    segments: new Set<string>(),
  };

  for (const part of parts) {
    merged.warnings.push(...part.warnings);
    for (const account of part.accounts) {
      const key = `${account.platform}:${account.externalId}`;
      if (entityKeys.accounts.has(key)) continue;
      entityKeys.accounts.add(key);
      merged.accounts.push(account);
    }
    for (const row of part.campaigns) {
      const key = `${row.platform}:${row.externalId}`;
      if (entityKeys.campaigns.has(key)) continue;
      entityKeys.campaigns.add(key);
      merged.campaigns.push(row);
    }
    for (const row of part.adGroups) {
      const key = `${row.platform}:${row.externalId}`;
      if (entityKeys.adGroups.has(key)) continue;
      entityKeys.adGroups.add(key);
      merged.adGroups.push(row);
    }
    for (const row of part.ads) {
      const key = `${row.platform}:${row.externalId}`;
      if (entityKeys.ads.has(key)) continue;
      entityKeys.ads.add(key);
      merged.ads.push(row);
    }
    for (const row of part.creatives) {
      const existing = merged.creatives.find((creative) => creative.fingerprint === row.fingerprint);
      if (existing) {
        for (const ref of row.platformCreativeIds) {
          if (!existing.platformCreativeIds.some((item) => item.platform === ref.platform && item.externalId === ref.externalId)) {
            existing.platformCreativeIds.push(ref);
          }
        }
        continue;
      }
      merged.creatives.push({ ...row, platformCreativeIds: [...row.platformCreativeIds] });
    }
    for (const row of part.audiences) {
      const key = `${row.platform}:${row.externalId}`;
      if (entityKeys.audiences.has(key)) continue;
      entityKeys.audiences.add(key);
      merged.audiences.push(row);
    }
    for (const row of part.adGroupAudiences) {
      const key = `${row.adGroupExternalId}:${row.audienceExternalId}:${row.role}`;
      if (entityKeys.links.has(key)) continue;
      entityKeys.links.add(key);
      merged.adGroupAudiences.push(row);
    }
    for (const row of part.segments) {
      const key = `${row.kind}:${row.segmentKey}`;
      if (entityKeys.segments.has(key)) continue;
      entityKeys.segments.add(key);
      merged.segments.push(row);
    }
    for (const row of part.metrics) {
      const key = `${row.date}|${row.platform}|${row.adExternalId}|${row.segmentKind}|${row.segmentKey}|${row.attributionWindow}`;
      if (metricKeys.has(key)) continue;
      metricKeys.add(key);
      merged.metrics.push(row);
    }
    for (const row of part.raw) {
      const key = `${row.platform}:${row.objectType}:${row.externalId}`;
      if (entityKeys.raw.has(key)) continue;
      entityKeys.raw.add(key);
      merged.raw.push(row);
    }
  }
  if (!merged.segments.length) merged.segments.push(ALL_SEGMENT);
  return merged;
}

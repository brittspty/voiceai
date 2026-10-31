import type { Env } from "../config";
import { linkTouchpoints } from "./identity";
import { costPerIncremental, incrementalLift, planMaidHoldout, recommendFromLift, type LiftResult } from "./incrementality";
import { exposureExclusion, type QualityLists } from "./quality";
import type { CtvAudience, CtvConversion, CtvDelivery, CtvExposure, CtvPull, CtvRecommendation } from "./types";
import { defaultIsVerifiedHuman, VERIFIED_HUMAN_LABEL, verificationStatus, type IsVerifiedHuman } from "./verified";
import { creditConversions, jasonWindows, lagBucket, LAG_BUCKETS, windowLabel, type Credit } from "./windows";

export const CTV_STAFF_LABEL = "CTV (StackAdapt)";
export const CTV_CLIENT_LABEL = "CTV";
export const CTV_CLIENT_PHRASE = "Connected TV ads";

/** CTV in this product is StackAdapt. Staff see the vendor. Clients do not. */
export function ctvPlatformLabel(platform: string, audience: "staff" | "client" = "staff") {
  const key = platform.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (key === "stackadapt" || key === "ctv") return audience === "staff" ? CTV_STAFF_LABEL : CTV_CLIENT_LABEL;
  if (key === "google ads" || key === "google") return "Google Ads";
  if (key === "meta" || key === "facebook") return "Meta";
  if (audience === "client") return CTV_CLIENT_LABEL;
  return platform.trim() || CTV_STAFF_LABEL;
}

function otherChannel(channel: string) {
  const key = channel.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!key || key === "stackadapt" || key === "ctv") return "";
  return ctvPlatformLabel(channel);
}

function segmentKey(row: { maidListId: string; vendorId: string; subSegmentKey: string }) {
  return `${row.maidListId}\0${row.vendorId}\0${row.subSegmentKey}`;
}

function recommendationNote(action: CtvRecommendation | null, label: string) {
  if (action === "scale") return "Scale. Recommendation only. Budgets are not changed.";
  if (action === "test") return "Test. Recommendation only. Budgets are not changed.";
  if (action === "cut") return "Cut. Recommendation only. Budgets are not changed.";
  if (label === "attributed, not incremental") return "Attributed, not incremental. No scale, test, or cut.";
  return "Recommendation only. Budgets are not changed.";
}

export type CtvSegmentView = {
  maidListId: string;
  vendorId: string;
  subSegmentKey: string;
  householdsReached: number;
  deterministicMatchRate: number | null;
  verifiedClickConversions: number;
  verifiedViewConversions: number;
  deterministicClickConversions: number;
  deterministicViewConversions: number;
  allMatchedConversions: number;
  lift: number | null;
  liftCiLow: number | null;
  liftCiHigh: number | null;
  liftLabel: string;
  spend: number;
  cost: number;
  cpm: number | null;
  cpa: number | null;
  cpl: number | null;
  roas: number | null;
  conversionValue: number;
  costPerIncrementalVerified: number | null;
  recommendation: CtvRecommendation | null;
  recommendationOnly: true;
  changesSpend: false;
  writesAds: false;
  note: string;
};

export type CtvView = {
  platformLabel: typeof CTV_STAFF_LABEL;
  publicName: typeof CTV_CLIENT_PHRASE;
  exampleData: boolean;
  verifiedHumanLabel: typeof VERIFIED_HUMAN_LABEL;
  windows: { clickDays: number; viewDays: number; label: string; nativeLabel: string };
  sensitivity: { changesDefault: false; view3Days: number; view7Days: number; note: string };
  funnel: { exposedHouseholds: number; siteVisits: number; leadsAndConversions: number };
  lag: { id: string; label: string; count: number }[];
  assists: { channel: string; count: number }[];
  delivery: {
    impressions: number;
    uniqueImpressions: number;
    frequency: number | null;
    completionRate: number | null;
    completion25: number;
    completion50: number;
    completion75: number;
    completion100: number;
    reportedClickConversions: number;
    reportedViewConversions: number;
    ipConversions: number;
    cookieConversions: number;
    siteVisits: number;
    spend: number;
    cost: number;
    cpm: number | null;
    cpa: number | null;
    cpl: number | null;
    roas: number | null;
    conversionValue: number;
  };
  devices: { name: string; impressions: number; spend: number }[];
  publishers: { name: string; impressions: number; spend: number }[];
  segments: CtvSegmentView[];
  warnings: string[];
  budgetsTouched: false;
  identity: { householdIds: string[]; ipHashes: string[] };
};

function ratio(part: number, whole: number) {
  if (whole <= 0) return null;
  return part / whole;
}

function deliveryTotals(rows: CtvDelivery[]) {
  const totals = rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      uniqueImpressions: sum.uniqueImpressions + row.uniqueImpressions,
      weightedFrequency: sum.weightedFrequency + row.frequency * row.impressions,
      completion25: sum.completion25 + row.completion25,
      completion50: sum.completion50 + row.completion50,
      completion75: sum.completion75 + row.completion75,
      completion100: sum.completion100 + row.completion100,
      reportedClickConversions: sum.reportedClickConversions + row.clickConversions,
      reportedViewConversions: sum.reportedViewConversions + row.viewConversions,
      ipConversions: sum.ipConversions + row.ipConversions,
      cookieConversions: sum.cookieConversions + row.cookieConversions,
      siteVisits: sum.siteVisits + row.siteVisits,
      spend: sum.spend + row.spend,
      conversionValue: sum.conversionValue + row.conversionValue,
    }),
    {
      impressions: 0,
      uniqueImpressions: 0,
      weightedFrequency: 0,
      completion25: 0,
      completion50: 0,
      completion75: 0,
      completion100: 0,
      reportedClickConversions: 0,
      reportedViewConversions: 0,
      ipConversions: 0,
      cookieConversions: 0,
      siteVisits: 0,
      spend: 0,
      conversionValue: 0,
    },
  );
  return {
    ...totals,
    frequency: totals.impressions > 0 ? totals.weightedFrequency / totals.impressions : null,
    completionRate: ratio(totals.completion100, totals.impressions),
    cost: totals.spend,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
    cpa: null as number | null,
    cpl: null as number | null,
    roas: totals.spend > 0 ? totals.conversionValue / totals.spend : null,
  };
}

function groupRows<T extends { name: string; impressions: number; spend: number }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const name = row.name || "Unknown";
    const current = map.get(name) ?? { ...row, name, impressions: 0, spend: 0 };
    current.impressions += row.impressions;
    current.spend += row.spend;
    map.set(name, current);
  }
  return [...map.values()].sort((a, b) => b.impressions - a.impressions || a.name.localeCompare(b.name));
}

export function buildCtvView(pull: CtvPull, options: { env?: Env; hook?: IsVerifiedHuman; lists?: QualityLists } = {}): CtvView {
  const hook = options.hook ?? defaultIsVerifiedHuman;
  const windows = jasonWindows(options.env);
  const usable: CtvExposure[] = [];
  for (const exposure of pull.exposures) {
    if (exposureExclusion(exposure, options.lists)) continue;
    usable.push(exposure);
  }
  const links = linkTouchpoints(usable, pull.conversions, pull.households);
  const credited = creditConversions(links, windows);
  const verifiedViewCount = (viewDays: number) => {
    const pass = creditConversions(links, { clickDays: windows.clickDays, viewDays });
    let count = 0;
    for (const credit of pass.credits) {
      if (credit.linkType !== "view") continue;
      const conversion = pull.conversions.find((row) => row.conversionId === credit.conversionId);
      if (!conversion || otherChannel(conversion.creditedChannel)) continue;
      const status = verificationStatus(
        {
          passesDedupe: conversion.passesDedupe,
          leadInvolved: conversion.leadInvolved,
          contactValid: conversion.contactValid,
          crmOrPixelEngaged: conversion.crmOrPixelEngaged,
          probabilisticOnly: credit.probabilisticOnly,
        },
        hook,
      );
      if (status === "verified_human") count += 1;
    }
    return count;
  };
  const creditByConversion = new Map<string, Credit>(credited.credits.map((row) => [row.conversionId, row]));
  const exposedHouseholds = new Set(usable.map((row) => row.householdId).filter(Boolean));
  const visitHouseholds = new Set<string>();
  const leadHouseholds = new Set<string>();
  const assists = new Map<string, number>();
  const lagCounts = new Map(LAG_BUCKETS.map((bucket) => [bucket.id, 0]));

  type Kept = { conversion: CtvConversion; credit: Credit; status: ReturnType<typeof verificationStatus> };
  const kept: Kept[] = [];
  for (const conversion of pull.conversions) {
    const credit = creditByConversion.get(conversion.conversionId);
    if (!credit) continue;
    const assist = otherChannel(conversion.creditedChannel);
    if (conversion.siteVisit && conversion.householdId) visitHouseholds.add(conversion.householdId);
    if (assist) {
      assists.set(assist, (assists.get(assist) ?? 0) + 1);
      continue;
    }
    const status = verificationStatus(
      {
        passesDedupe: conversion.passesDedupe,
        leadInvolved: conversion.leadInvolved,
        contactValid: conversion.contactValid,
        crmOrPixelEngaged: conversion.crmOrPixelEngaged,
        probabilisticOnly: credit.probabilisticOnly,
      },
      hook,
    );
    if (status !== "verified_human") continue;
    kept.push({ conversion, credit, status });
    if (conversion.householdId) leadHouseholds.add(conversion.householdId);
    const bucket = lagBucket(credit.lagHours);
    lagCounts.set(bucket.id, (lagCounts.get(bucket.id) ?? 0) + 1);
  }

  const segmentIds = new Map<string, { maidListId: string; vendorId: string; subSegmentKey: string }>();
  for (const row of [...usable, ...pull.conversions, ...pull.delivery]) {
    if (!row.maidListId && !row.vendorId && !row.subSegmentKey) continue;
    segmentIds.set(segmentKey(row), { maidListId: row.maidListId, vendorId: row.vendorId, subSegmentKey: row.subSegmentKey });
  }

  const segments: CtvSegmentView[] = [...segmentIds.values()].map((id) => {
    const exposures = usable.filter((row) => segmentKey(row) === segmentKey(id));
    const reached = [...new Set(exposures.map((row) => row.householdId).filter(Boolean))];
    const deterministicHouseholds = new Set(
      links.filter((link) => link.matchMethod === "deterministic_maid" && exposures.some((row) => row.eventId === link.exposureEventId)).map((link) => {
        return exposures.find((row) => row.eventId === link.exposureEventId)?.householdId ?? "";
      }).filter(Boolean),
    );
    const mine = kept.filter((row) => segmentKey(row.conversion) === segmentKey(id));
    const verifiedClick = mine.filter((row) => row.credit.linkType === "click");
    const verifiedView = mine.filter((row) => row.credit.linkType === "view");
    const deterministicClick = verifiedClick.filter((row) => row.credit.matchMethod === "deterministic_maid");
    const deterministicView = verifiedView.filter((row) => row.credit.matchMethod === "deterministic_maid");
    const households = [...new Set([...reached, ...pull.conversions.filter((row) => segmentKey(row) === segmentKey(id)).map((row) => row.householdId).filter(Boolean)])];
    const plan = planMaidHoldout({ maidListId: id.maidListId || "audience", householdIds: households });
    const holdout = new Set(plan.assignments.filter((row) => row.role === "holdout").map((row) => row.householdId));
    const exposed = new Set(plan.assignments.filter((row) => row.role === "exposed").map((row) => row.householdId));
    const verifiedHouseholds = new Set(mine.map((row) => row.conversion.householdId).filter(Boolean));
    const lift: LiftResult = incrementalLift({
      exposedHouseholds: exposed.size,
      exposedVerified: [...verifiedHouseholds].filter((householdId) => exposed.has(householdId)).length,
      holdoutHouseholds: holdout.size,
      holdoutVerified: [...verifiedHouseholds].filter((householdId) => holdout.has(householdId)).length,
      ghostOrPsa: ghostFor(pull, id),
    });
    const action = recommendFromLift(lift);
    const spend = pull.delivery.filter((row) => segmentKey(row) === segmentKey(id)).reduce((sum, row) => sum + row.spend, 0);
    const impressions = pull.delivery.filter((row) => segmentKey(row) === segmentKey(id)).reduce((sum, row) => sum + row.impressions, 0);
    const conversionValue = pull.delivery.filter((row) => segmentKey(row) === segmentKey(id)).reduce((sum, row) => sum + row.conversionValue, 0);
    const verifiedLeads = mine.filter((row) => row.conversion.leadInvolved).length;
    const verifiedCount = mine.length;
    return {
      maidListId: id.maidListId,
      vendorId: id.vendorId,
      subSegmentKey: id.subSegmentKey,
      householdsReached: reached.length,
      deterministicMatchRate: ratio(deterministicHouseholds.size, reached.length),
      verifiedClickConversions: verifiedClick.length,
      verifiedViewConversions: verifiedView.length,
      deterministicClickConversions: deterministicClick.length,
      deterministicViewConversions: deterministicView.length,
      allMatchedConversions: verifiedCount,
      lift: lift.lift,
      liftCiLow: lift.ciLow,
      liftCiHigh: lift.ciHigh,
      liftLabel: lift.label,
      spend,
      cost: spend,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      cpa: verifiedCount > 0 ? spend / verifiedCount : null,
      cpl: verifiedLeads > 0 ? spend / verifiedLeads : null,
      roas: spend > 0 ? conversionValue / spend : null,
      conversionValue,
      costPerIncrementalVerified: costPerIncremental(spend, lift.incremental ? lift.lift : null, exposed.size),
      recommendation: action,
      recommendationOnly: true as const,
      changesSpend: false as const,
      writesAds: false as const,
      note: recommendationNote(action, lift.label),
    };
  }).sort((a, b) => a.maidListId.localeCompare(b.maidListId) || a.subSegmentKey.localeCompare(b.subSegmentKey));

  const totals = deliveryTotals(pull.delivery);
  const verifiedLeads = kept.filter((row) => row.conversion.leadInvolved).length;
  totals.cpa = kept.length > 0 ? totals.spend / kept.length : null;
  totals.cpl = verifiedLeads > 0 ? totals.spend / verifiedLeads : null;
  const warnings = [...pull.warnings];
  if (!warnings.some((warning) => warning.includes("unique impressions"))) {
    warnings.push("Unique impressions are the documented reach field. A household id is not on the public delivery objects. TODO(verify).");
  }
  return {
    platformLabel: CTV_STAFF_LABEL,
    publicName: CTV_CLIENT_PHRASE,
    exampleData: pull.exampleData,
    verifiedHumanLabel: VERIFIED_HUMAN_LABEL,
    windows: {
      clickDays: windows.clickDays,
      viewDays: windows.viewDays,
      label: `Jason's attribution: ${windowLabel(windows.clickDays, windows.viewDays)}`,
      nativeLabel: pull.nativeWindow.label,
    },
    sensitivity: {
      changesDefault: false as const,
      view3Days: verifiedViewCount(3),
      view7Days: verifiedViewCount(7),
      note: "Optional 3-day and 7-day view windows. They do not change the default.",
    },
    funnel: {
      exposedHouseholds: exposedHouseholds.size,
      siteVisits: visitHouseholds.size,
      leadsAndConversions: leadHouseholds.size,
    },
    lag: LAG_BUCKETS.map((bucket) => ({ id: bucket.id, label: bucket.label, count: lagCounts.get(bucket.id) ?? 0 })),
    assists: [...assists.entries()].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
    delivery: {
      impressions: totals.impressions,
      uniqueImpressions: totals.uniqueImpressions,
      frequency: totals.frequency,
      completionRate: totals.completionRate,
      completion25: totals.completion25,
      completion50: totals.completion50,
      completion75: totals.completion75,
      completion100: totals.completion100,
      reportedClickConversions: totals.reportedClickConversions,
      reportedViewConversions: totals.reportedViewConversions,
      ipConversions: totals.ipConversions,
      cookieConversions: totals.cookieConversions,
      siteVisits: totals.siteVisits,
      spend: totals.spend,
      cost: totals.cost,
      cpm: totals.cpm,
      cpa: totals.cpa,
      cpl: totals.cpl,
      roas: totals.roas,
      conversionValue: totals.conversionValue,
    },
    devices: groupRows(pull.delivery.map((row) => ({ name: row.deviceType || "Unknown", impressions: row.impressions, spend: row.spend }))),
    publishers: groupRows(pull.delivery.map((row) => ({ name: row.publisher || "Unknown", impressions: row.impressions, spend: row.spend }))),
    segments,
    warnings,
    budgetsTouched: false as const,
    identity: {
      householdIds: [...exposedHouseholds].sort(),
      ipHashes: [...new Set(usable.map((row) => row.ipHash).filter(Boolean))].sort(),
    },
  };
}

function ghostFor(pull: CtvPull, id: { maidListId: string; vendorId: string; subSegmentKey: string }) {
  const lift = pull.platformLifts.find((row) => (row.kind === "ghost_bid" || row.kind === "psa") && (!row.maidListId || row.maidListId === id.maidListId));
  if (!lift) return null;
  return {
    kind: lift.kind as "ghost_bid" | "psa",
    exposedCvr: lift.exposedCvr,
    controlCvr: lift.controlCvr,
    exposedTrials: lift.exposedTrials,
    controlTrials: lift.controlTrials,
  };
}

const MONEY_KEYS = new Set([
  "spend",
  "cost",
  "cpm",
  "cpa",
  "cpl",
  "roas",
  "costperincrementalverified",
  "costperincremental",
  "conversionvalue",
  "ecpm",
  "ecpa",
  "ecpc",
]);

const IDENTITY_KEYS = new Set(["vendorid", "iphash", "householdid", "householdids", "iphashes", "vendorids", "identity"]);

function canonical(key: string) {
  return key.replace(/[_-]/g, "").toLowerCase();
}

export function ctvPayloadForViewer<T>(value: T, audience: CtvAudience): T {
  if (audience === "staff") return value;
  const stripIdentity = audience === "client" || audience === "share";
  const stripped = stripValue(value, stripIdentity) as T;
  if (!stripIdentity || !stripped || typeof stripped !== "object") return stripped;
  const record = stripped as Record<string, unknown>;
  if ("platformLabel" in record) record.platformLabel = CTV_CLIENT_LABEL;
  return stripped;
}

function clientFacingText(value: string) {
  return value
    .split(CTV_STAFF_LABEL).join(CTV_CLIENT_LABEL)
    .replace(/stackadapt/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:,.])/g, "$1")
    .trim();
}

function stripValue(value: unknown, stripIdentity: boolean): unknown {
  if (typeof value === "string") return stripIdentity ? clientFacingText(value) : value;
  if (Array.isArray(value)) return value.map((item) => stripValue(item, stripIdentity));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const name = canonical(key);
    if (MONEY_KEYS.has(name)) continue;
    if (stripIdentity && IDENTITY_KEYS.has(name)) continue;
    next[key] = stripValue(child, stripIdentity);
  }
  return next;
}

export function ctvHttpDecision(input: { enabled: boolean; kind: string; share?: boolean; seesCost?: boolean }) {
  if (!input.enabled) return { status: 404 as const, audience: null };
  if (input.share) return { status: 200 as const, audience: "share" as const };
  if (input.kind === "client_owner" || input.kind === "client_viewer" || input.kind === "none") {
    return { status: 403 as const, audience: "client" as const };
  }
  if (input.kind === "super_admin" || input.kind === "account_manager" || input.kind === "staff" || input.kind === "all_clients_viewer") {
    return { status: 200 as const, audience: input.seesCost ? ("staff" as const) : ("staff_nocost" as const) };
  }
  return { status: 403 as const, audience: "client" as const };
}

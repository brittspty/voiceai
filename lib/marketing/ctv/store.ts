import { createHash } from "node:crypto";
import type { Env } from "../config";
import { WORKSPACE_ID } from "../types";
import { linkTouchpoints } from "./identity";
import { planMaidHoldout } from "./incrementality";
import { exposureExclusion } from "./quality";
import { buildCtvView, type CtvView } from "./report";
import type { CtvConversion, CtvDelivery, CtvExposure, CtvHousehold, CtvPull } from "./types";
import { verificationStatus } from "./verified";
import { creditConversions, jasonWindows } from "./windows";

export type CtvRecords = {
  view: CtvView;
  exposures: (CtvExposure & { excluded: boolean; excludeReason: string })[];
  households: CtvHousehold[];
  conversions: (CtvConversion & { verificationStatus: string })[];
  links: ReturnType<typeof creditConversions>["links"];
  delivery: CtvDelivery[];
  holdouts: { maidListId: string; householdId: string; role: string; percent: number; uploaded: false }[];
  window: CtvPull["nativeWindow"];
  lifts: CtvPull["platformLifts"];
  exampleData: boolean;
  warnings: string[];
};

export function prepareCtvRecords(pull: CtvPull, env?: Env): CtvRecords {
  const view = buildCtvView(pull, { env });
  const exposures = pull.exposures.map((row) => {
    const excludeReason = exposureExclusion(row);
    return { ...row, excluded: Boolean(excludeReason), excludeReason };
  });
  const usable = exposures.filter((row) => !row.excluded);
  const links = creditConversions(linkTouchpoints(usable, pull.conversions, pull.households), jasonWindows(env)).links;
  const counted = new Map(links.filter((row) => row.counted).map((row) => [row.conversionId, row]));
  const conversions = pull.conversions.map((row) => {
    const credit = counted.get(row.conversionId);
    return {
      ...row,
      verificationStatus: credit
        ? verificationStatus({
            passesDedupe: row.passesDedupe,
            leadInvolved: row.leadInvolved,
            contactValid: row.contactValid,
            crmOrPixelEngaged: row.crmOrPixelEngaged,
            probabilisticOnly: credit.matchMethod === "probabilistic",
          })
        : "unflagged",
    };
  });
  const byList = new Map<string, string[]>();
  for (const row of [...usable, ...pull.conversions]) {
    if (!row.householdId) continue;
    const list = byList.get(row.maidListId) ?? [];
    list.push(row.householdId);
    byList.set(row.maidListId, list);
  }
  const holdouts = [...byList.entries()].flatMap(([maidListId, householdIds]) => {
    const plan = planMaidHoldout({ maidListId: maidListId || "audience", householdIds });
    return plan.assignments.map((row) => ({ ...row, percent: plan.percent, uploaded: false as const }));
  });
  return {
    view,
    exposures,
    households: pull.households,
    conversions,
    links,
    delivery: pull.delivery.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)),
    holdouts,
    window: pull.nativeWindow,
    lifts: pull.platformLifts,
    exampleData: pull.exampleData,
    warnings: view.warnings,
  };
}

function deliveryKey(row: CtvDelivery) {
  const raw = [row.date, row.campaignId, row.lineItemId, row.creativeId, row.audienceId, row.maidListId, row.subSegmentKey, row.deviceType, row.publisher].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function money(value: number | null) {
  return value == null ? null : value.toFixed(4);
}

export async function saveCtvRecords(workspaceId: string, records: CtvRecords, pulledAt = new Date()) {
  const { prisma } = await import("../../db");
  const where = { workspaceId };
  await prisma.$transaction(async (tx) => {
    await tx.ctvExposure.deleteMany({ where });
    await tx.ctvHousehold.deleteMany({ where });
    await tx.ctvConversion.deleteMany({ where });
    await tx.ctvTouchpointLink.deleteMany({ where });
    await tx.ctvDeliveryDay.deleteMany({ where });
    await tx.ctvHoldoutDraft.deleteMany({ where });
    await tx.ctvSegmentRead.deleteMany({ where });
    await tx.ctvWindowSetting.deleteMany({ where });
    await tx.ctvPlatformLift.deleteMany({ where });
    if (records.exposures.length) {
      await tx.ctvExposure.createMany({
        data: records.exposures.map((row) => ({
          workspaceId,
          eventId: row.eventId,
          occurredAt: new Date(row.ts),
          platform: "stackadapt",
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          lineItemId: row.lineItemId,
          lineItemName: row.lineItemName,
          creativeId: row.creativeId,
          creativeName: row.creativeName,
          audienceId: row.audienceId,
          maidListId: row.maidListId,
          vendorId: row.vendorId,
          subSegmentKey: row.subSegmentKey,
          householdId: row.householdId,
          ipHash: row.ipHash,
          deviceType: row.deviceType,
          publisher: row.publisher,
          appBundle: row.appBundle,
          completionPct: row.completionPct,
          interaction: row.interaction,
          maid: row.maid,
          excluded: row.excluded,
          excludeReason: row.excludeReason,
        })),
      });
    }
    if (records.households.length) {
      await tx.ctvHousehold.createMany({
        data: records.households.map((row) => ({
          workspaceId,
          householdId: row.householdId,
          ipHash: row.ipHash,
          linkedMaids: row.linkedMaids,
          linkedCookies: row.linkedCookies,
          matchMethod: row.matchMethod,
          matchConfidence: row.matchConfidence,
        })),
      });
    }
    if (records.conversions.length) {
      await tx.ctvConversion.createMany({
        data: records.conversions.map((row) => ({
          workspaceId,
          conversionId: row.conversionId,
          pixelEvent: row.pixelEvent,
          occurredAt: new Date(row.ts),
          value: money(row.value) ?? "0.0000",
          verificationStatus: row.verificationStatus,
          crmOutcome: row.crmOutcome,
          maidListId: row.maidListId,
          vendorId: row.vendorId,
          subSegmentKey: row.subSegmentKey,
          audienceId: row.audienceId,
          householdId: row.householdId,
          ipHash: row.ipHash,
          deviceType: row.deviceType,
          maid: row.maid,
          cookie: row.cookie,
          passesDedupe: row.passesDedupe,
          leadInvolved: row.leadInvolved,
          contactValid: row.contactValid,
          crmOrPixelEngaged: row.crmOrPixelEngaged,
          siteVisit: row.siteVisit,
          creditedChannel: row.creditedChannel,
        })),
      });
    }
    if (records.links.length) {
      await tx.ctvTouchpointLink.createMany({
        data: records.links.map((row) => ({
          workspaceId,
          exposureEventId: row.exposureEventId,
          conversionId: row.conversionId,
          linkType: row.linkType,
          matchMethod: row.matchMethod,
          matchConfidence: row.matchConfidence,
          lagHours: row.lagHours,
          counted: row.counted,
        })),
      });
    }
    if (records.delivery.length) {
      await tx.ctvDeliveryDay.createMany({
        data: records.delivery.map((row) => ({
          workspaceId,
          date: new Date(`${row.date}T00:00:00.000Z`),
          platform: "stackadapt",
          identityKey: deliveryKey(row),
          campaignId: row.campaignId,
          campaignName: row.campaignName,
          lineItemId: row.lineItemId,
          lineItemName: row.lineItemName,
          creativeId: row.creativeId,
          creativeName: row.creativeName,
          audienceId: row.audienceId,
          audienceName: row.audienceName,
          maidListId: row.maidListId,
          vendorId: row.vendorId,
          subSegmentKey: row.subSegmentKey,
          deviceType: row.deviceType,
          publisher: row.publisher,
          impressions: BigInt(Math.round(row.impressions)),
          uniqueImpressions: BigInt(Math.round(row.uniqueImpressions)),
          frequency: money(row.frequency) ?? "0.0000",
          completion25: BigInt(Math.round(row.completion25)),
          completion50: BigInt(Math.round(row.completion50)),
          completion75: BigInt(Math.round(row.completion75)),
          completion100: BigInt(Math.round(row.completion100)),
          spend: money(row.spend) ?? "0.0000",
          clickConversions: money(row.clickConversions) ?? "0.0000",
          viewConversions: money(row.viewConversions) ?? "0.0000",
          conversionValue: money(row.conversionValue) ?? "0.0000",
          ipConversions: money(row.ipConversions) ?? "0.0000",
          cookieConversions: money(row.cookieConversions) ?? "0.0000",
          siteVisits: money(row.siteVisits) ?? "0.0000",
          currency: row.currency || "USD",
          exampleData: records.exampleData,
        })),
      });
    }
    if (records.holdouts.length) {
      await tx.ctvHoldoutDraft.createMany({
        data: records.holdouts.map((row) => ({
          workspaceId,
          maidListId: row.maidListId,
          householdId: row.householdId,
          role: row.role,
          percent: row.percent,
          uploaded: false,
        })),
      });
    }
    if (records.view.segments.length) {
      await tx.ctvSegmentRead.createMany({
        data: records.view.segments.map((row) => ({
          workspaceId,
          platform: "stackadapt",
          maidListId: row.maidListId,
          vendorId: row.vendorId,
          subSegmentKey: row.subSegmentKey,
          householdsReached: row.householdsReached,
          deterministicMatchRate: row.deterministicMatchRate,
          verifiedClickConversions: row.verifiedClickConversions,
          verifiedViewConversions: row.verifiedViewConversions,
          deterministicClick: row.deterministicClickConversions,
          deterministicView: row.deterministicViewConversions,
          lift: row.lift,
          liftCiLow: row.liftCiLow,
          liftCiHigh: row.liftCiHigh,
          liftLabel: row.liftLabel,
          spend: money(row.spend),
          costPerIncremental: money(row.costPerIncrementalVerified),
          cpm: money(row.cpm),
          cpa: money(row.cpa),
          cpl: money(row.cpl),
          roas: money(row.roas),
          recommendation: row.recommendation ?? "",
          recommendationOnly: true,
          changesSpend: false,
          writesAds: false,
          windowLabel: records.view.windows.label,
          nativeWindowLabel: records.view.windows.nativeLabel,
          exampleData: records.exampleData,
          readAt: pulledAt,
        })),
      });
    }
    await tx.ctvWindowSetting.create({
      data: {
        workspaceId,
        platform: "stackadapt",
        clickDays: records.window.clickDays,
        viewDays: records.window.viewDays,
        label: records.window.label,
        source: records.window.source,
        exampleData: records.exampleData,
        warnings: records.warnings,
        pulledAt,
      },
    });
    if (records.lifts.length) {
      await tx.ctvPlatformLift.createMany({
        data: records.lifts.map((row) => ({
          workspaceId,
          platform: "stackadapt",
          kind: row.kind,
          name: row.name,
          maidListId: row.maidListId,
          vendorId: row.vendorId,
          subSegmentKey: row.subSegmentKey,
          exposedCvr: row.exposedCvr,
          controlCvr: row.controlCvr,
          exposedTrials: row.exposedTrials,
          controlTrials: row.controlTrials,
          pulledAt,
        })),
      });
    }
  });
}

function num(value: { toString(): string } | number | bigint | null | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === "bigint" ? Number(value) : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function readCtvPull(workspaceId = WORKSPACE_ID): Promise<CtvPull | null> {
  const { prisma } = await import("../../db");
  const [exposures, households, conversions, delivery, window, lifts] = await Promise.all([
    prisma.ctvExposure.findMany({ where: { workspaceId } }),
    prisma.ctvHousehold.findMany({ where: { workspaceId } }),
    prisma.ctvConversion.findMany({ where: { workspaceId } }),
    prisma.ctvDeliveryDay.findMany({ where: { workspaceId } }),
    prisma.ctvWindowSetting.findFirst({ where: { workspaceId }, orderBy: { pulledAt: "desc" } }),
    prisma.ctvPlatformLift.findMany({ where: { workspaceId } }),
  ]);
  if (!exposures.length && !delivery.length && !window) return null;
  return {
    platform: "stackadapt",
    exampleData: window?.exampleData ?? delivery.some((row) => row.exampleData),
    warnings: window?.warnings ?? [],
    exposures: exposures.map((row) => ({
      eventId: row.eventId,
      ts: row.occurredAt.toISOString(),
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      lineItemId: row.lineItemId,
      lineItemName: row.lineItemName,
      creativeId: row.creativeId,
      creativeName: row.creativeName,
      audienceId: row.audienceId,
      maidListId: row.maidListId,
      vendorId: row.vendorId,
      subSegmentKey: row.subSegmentKey,
      householdId: row.householdId,
      ipHash: row.ipHash,
      deviceType: row.deviceType,
      publisher: row.publisher,
      appBundle: row.appBundle,
      completionPct: row.completionPct,
      interaction: row.interaction === "click" ? "click" : "view",
      maid: row.maid,
    })),
    households: households.map((row) => ({
      householdId: row.householdId,
      ipHash: row.ipHash,
      linkedMaids: row.linkedMaids,
      linkedCookies: row.linkedCookies,
      matchMethod: row.matchMethod === "deterministic_maid" || row.matchMethod === "ip_device_graph" ? row.matchMethod : "probabilistic",
      matchConfidence: row.matchConfidence,
    })),
    conversions: conversions.map((row) => ({
      conversionId: row.conversionId,
      pixelEvent: row.pixelEvent,
      ts: row.occurredAt.toISOString(),
      value: num(row.value),
      crmOutcome: row.crmOutcome,
      maidListId: row.maidListId,
      vendorId: row.vendorId,
      subSegmentKey: row.subSegmentKey,
      audienceId: row.audienceId,
      householdId: row.householdId,
      ipHash: row.ipHash,
      deviceType: row.deviceType,
      maid: row.maid,
      cookie: row.cookie,
      passesDedupe: row.passesDedupe,
      leadInvolved: row.leadInvolved,
      contactValid: row.contactValid,
      crmOrPixelEngaged: row.crmOrPixelEngaged,
      siteVisit: row.siteVisit,
      creditedChannel: row.creditedChannel,
    })),
    delivery: delivery.map((row) => ({
      date: day(row.date),
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      lineItemId: row.lineItemId,
      lineItemName: row.lineItemName,
      creativeId: row.creativeId,
      creativeName: row.creativeName,
      audienceId: row.audienceId,
      audienceName: row.audienceName,
      maidListId: row.maidListId,
      vendorId: row.vendorId,
      subSegmentKey: row.subSegmentKey,
      deviceType: row.deviceType,
      publisher: row.publisher,
      impressions: num(row.impressions),
      uniqueImpressions: num(row.uniqueImpressions),
      frequency: num(row.frequency),
      completion25: num(row.completion25),
      completion50: num(row.completion50),
      completion75: num(row.completion75),
      completion100: num(row.completion100),
      completionRate: num(row.impressions) > 0 ? num(row.completion100) / num(row.impressions) : null,
      spend: num(row.spend),
      clickConversions: num(row.clickConversions),
      viewConversions: num(row.viewConversions),
      conversionValue: num(row.conversionValue),
      ipConversions: num(row.ipConversions),
      cookieConversions: num(row.cookieConversions),
      siteVisits: num(row.siteVisits),
      currency: row.currency,
    })),
    nativeWindow: {
      clickDays: window?.clickDays ?? null,
      viewDays: window?.viewDays ?? null,
      label: window?.label || "StackAdapt native window: not in this response. TODO(verify) the conversion tracker window fields.",
      source: window?.source || "missing",
    },
    platformLifts: lifts.flatMap((row) => {
      if (row.kind !== "brand_lift" && row.kind !== "ghost_bid" && row.kind !== "psa") return [];
      return [{
        kind: row.kind,
        name: row.name,
        maidListId: row.maidListId,
        vendorId: row.vendorId,
        subSegmentKey: row.subSegmentKey,
        exposedCvr: row.exposedCvr ?? 0,
        controlCvr: row.controlCvr ?? 0,
        exposedTrials: row.exposedTrials,
        controlTrials: row.controlTrials,
      }];
    }),
  };
}

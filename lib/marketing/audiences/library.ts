import { compareMaidAudiences, platformMatch, type ComparableAudience, type PlatformPerformance } from "./compare";
import type { RefreshCadence } from "./import";
import { presentAudienceCard, presentPerformance, scrubClientTree, type AudienceReader, type PresentedAudience, type PresentedRow } from "./present";
import { PLATFORM_LABELS, type AudiencePlatform } from "./payloads";
import { pushStatusLabel } from "./push";
import { segmentConfidenceEngine, type AudienceSource, type SegmentTag } from "../segment-taxonomy";

/** A list is stale once it is older than 30 days. */
export const STALE_AFTER_DAYS = 30;

export type LibraryAudience = {
  id: string;
  name: string;
  source: AudienceSource;
  vendor: string;
  listId: string;
  consentBasis: string;
  refreshCadence: RefreshCadence;
  acquisitionDate: string | null;
  cost: string | null;
  size: number;
  tags: SegmentTag[];
  platforms: PlatformPerformance[];
  verifiedConversions: number;
  verifiedLeads: number;
  qualifiedLeads: number;
  pixelVisitors: number;
  pushes: { id: string; platform: AudiencePlatform; status: "pending" | "approved" | "declined"; undoUntil: string | null }[];
};

export function audienceFreshness(acquisitionDate: string | null, now: Date) {
  if (!acquisitionDate) return { freshness: "unknown" as const, days: null as number | null, label: "No acquisition date" };
  const then = new Date(`${acquisitionDate}T00:00:00.000Z`).getTime();
  const days = Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
  const fresh = days <= STALE_AFTER_DAYS;
  return {
    freshness: fresh ? "fresh" as const : "stale" as const,
    days,
    label: fresh ? `Fresh · ${days}d` : `Stale · ${days}d`,
  };
}

function platformView(platform: PlatformPerformance, verifiedLeads: number, verifiedConversions: number, seesCost: boolean) {
  const match = platformMatch(platform.uploaded, platform.matched);
  return {
    platform: platform.platform,
    label: PLATFORM_LABELS[platform.platform],
    uploaded: platform.uploaded,
    matched: platform.matched,
    matchRate: match.matchRate,
    matchRateLabel: match.matchRate === null ? "—" : `${(match.matchRate * 100).toFixed(1)}%`,
    reach: platform.reach,
    dataQuality: match.dataQuality,
    holdVerdict: match.holdVerdict,
    ...(seesCost
      ? {
          spend: platform.spend,
          cpl: verifiedLeads > 0 ? platform.spend / verifiedLeads : null,
          cpa: verifiedConversions > 0 ? platform.spend / verifiedConversions : null,
        }
      : {}),
  };
}

export function toComparable(row: LibraryAudience): ComparableAudience {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    vendor: row.vendor,
    listId: row.listId,
    tags: row.tags,
    platforms: row.platforms,
    verifiedConversions: row.verifiedConversions,
    verifiedLeads: row.verifiedLeads,
    qualifiedLeads: row.qualifiedLeads,
  };
}

export function presentLibrary(rows: LibraryAudience[], options: { reader?: AudienceReader; seesCost?: boolean; now?: Date } = {}) {
  const reader = options.reader ?? "staff";
  const seesCost = reader === "staff" && Boolean(options.seesCost);
  const now = options.now ?? new Date();
  const vendors = rows.map((row) => row.vendor);
  const cards: PresentedAudience[] = rows.map((row) => {
    const fresh = audienceFreshness(row.acquisitionDate, now);
    const platforms = row.platforms.map((platform) => platformView(platform, row.verifiedLeads, row.verifiedConversions, seesCost));
    const uploaded = row.platforms.reduce((sum, platform) => sum + platform.uploaded, 0);
    const matched = row.platforms.reduce((sum, platform) => sum + platform.matched, 0);
    const reach = row.platforms.reduce((sum, platform) => sum + platform.reach, 0);
    const match = platformMatch(uploaded, matched);
    const anyLow = platforms.some((platform) => platform.dataQuality === "flagged");
    const confidence = segmentConfidenceEngine.evaluate({
      sampleSize: reach || matched,
      verifiedConversions: row.verifiedConversions,
      matchRate: anyLow ? 0 : match.matchRate,
    });
    const leadQuality = row.verifiedConversions > 0 ? row.qualifiedLeads / row.verifiedConversions : null;
    const verifiedRate = (reach || matched) > 0 ? row.verifiedConversions / (reach || matched) : null;
    const qualityScore = confidence.holdVerdict || match.matchRate === null || verifiedRate === null
      ? null
      : Math.round(((match.matchRate * 0.4) + (verifiedRate * 0.4) + ((leadQuality ?? 0) * 0.2)) * 100);
    return presentAudienceCard({
      id: row.id,
      name: row.name,
      source: row.source,
      vendor: row.vendor,
      listId: row.listId,
      consentBasis: row.consentBasis,
      refreshCadence: row.refreshCadence,
      acquisitionDate: row.acquisitionDate,
      size: row.size,
      freshness: fresh.freshness,
      freshnessLabel: fresh.label,
      tags: row.tags,
      platforms,
      verifiedConversions: row.verifiedConversions,
      verifiedLeads: row.verifiedLeads,
      leadQuality,
      qualityScore,
      holdVerdict: confidence.holdVerdict || anyLow,
      confidence: anyLow ? "Match rate is under 30%. Data quality is flagged and the performance verdict is held." : confidence.reason,
      cost: row.cost,
      pixelVisitors: row.pixelVisitors,
      pushStatus: latestPushes(row, now),
    }, seesCost, reader);
  });
  const board = compareMaidAudiences(rows.map(toComparable));
  const leaderboard: Record<"lists" | "vendors" | "subsegments", PresentedRow[]> = {
    lists: board.lists.map((row) => presentPerformance(row, seesCost, reader, vendors)),
    vendors: board.vendors.map((row) => presentPerformance(row, seesCost, reader, vendors)),
    subsegments: board.subsegments.map((row) => presentPerformance(row, seesCost, reader, vendors)),
  };
  const view = { cards, leaderboard };
  if (reader === "client") return scrubClientTree(view, vendors) as typeof view;
  return view;
}

function latestPushes(row: LibraryAudience, now: Date) {
  const seen = new Set<string>();
  const status: PresentedAudience["pushStatus"] = [];
  for (const push of row.pushes) {
    if (seen.has(push.platform)) continue;
    seen.add(push.platform);
    status.push({
      id: push.id,
      platform: push.platform,
      label: PLATFORM_LABELS[push.platform],
      statusLabel: pushStatusLabel(push.status, push.undoUntil, now),
      undoUntil: push.undoUntil && Date.parse(push.undoUntil) > now.getTime() ? push.undoUntil : null,
    });
  }
  return status;
}

export function emptyPlatform(platform: AudiencePlatform): PlatformPerformance {
  return { platform, uploaded: 0, matched: 0, reach: 0, spend: 0 };
}

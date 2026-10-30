import type { SearchMatchType } from "@prisma/client";
import { prisma } from "../db";
import type { MarketingAccess } from "./access";
import { googleAdsEnv, normalizeCustomerId, type Env } from "./config";
import { accountFilter } from "./feature-access";
import {
  findWastedSearchTerms,
  normalizeTerm,
  presentProposal,
  type NegativeProposalDraft,
  type SearchTermRow,
} from "./search-waste";
import { isolatedWhere } from "./workspace";

function day(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function dec(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function clip(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function storedMatch(value: string): SearchTermRow["matchType"] {
  const text = value.toLowerCase();
  if (text.includes("exact")) return "exact";
  if (text.includes("phrase")) return "phrase";
  return "broad";
}

export async function listAdAccountChoices(workspaceId: string, env: Env = process.env) {
  const accounts = await prisma.adAccount.findMany({
    where: isolatedWhere(workspaceId, { platform: "google_ads" }),
    select: { id: true, name: true, currency: true, externalId: true },
    orderBy: { name: "asc" },
  });
  const allowed = googleAdsEnv(env).customerIds;
  if (!allowed.length) return accounts;
  return accounts.filter((account) => allowed.includes(normalizeCustomerId(account.externalId)));
}

export async function saveSearchWasteConfig(workspaceId: string, input: { brandTerms: string[]; otherLocations: string[] }) {
  const where = isolatedWhere(workspaceId);
  return prisma.searchWasteConfig.upsert({
    where: { workspaceId: where.workspaceId },
    create: { workspaceId: where.workspaceId, brandTerms: input.brandTerms, otherLocations: input.otherLocations },
    update: { brandTerms: input.brandTerms, otherLocations: input.otherLocations },
  });
}

export async function loadSearchWasteConfig(workspaceId: string) {
  return prisma.searchWasteConfig.findUnique({ where: { workspaceId: isolatedWhere(workspaceId).workspaceId } });
}

export async function ingestSearchTermRows(workspaceId: string, rows: SearchTermRow[]) {
  const scoped = rows.filter((row) => row.workspaceId === workspaceId);
  const campaigns = await prisma.campaign.findMany({
    where: isolatedWhere(workspaceId, { platform: "google_ads" }),
    select: {
      id: true,
      name: true,
      externalId: true,
      adAccountId: true,
      adGroups: { select: { id: true, name: true, externalId: true } },
    },
  });
  for (const row of scoped) {
    const campaign = campaigns.find((item) => item.adAccountId === row.adAccountId && item.name.toLowerCase() === row.campaignName.trim().toLowerCase());
    const adGroup = campaign?.adGroups.find((item) => item.name.toLowerCase() === row.adGroupName.trim().toLowerCase());
    const campaignExternalId = clip(campaign?.externalId || (row.adAccountId ? `import:${row.adAccountId}` : row.campaignName || "import"), 64) || "import";
    const adGroupExternalId = clip(adGroup?.externalId || row.adGroupName || "import", 64) || "import";
    const identity = {
      workspaceId: isolatedWhere(workspaceId).workspaceId,
      date: day(row.date),
      platform: "google_ads" as const,
      campaignExternalId,
      adGroupExternalId,
      term: clip(normalizeTerm(row.term), 500),
      matchType: clip(row.matchType, 64),
    };
    const metrics = {
      campaignId: campaign?.id ?? null,
      adGroupId: adGroup?.id ?? null,
      currency: row.currency || "USD",
      spend: row.spend.toFixed(4),
      impressions: BigInt(row.impressions),
      clicks: BigInt(row.clicks),
      conversions: row.conversions.toFixed(4),
      qualifiedConversions: row.qualifiedConversions.toFixed(4),
    };
    await prisma.searchTermMetric.upsert({
      where: { workspaceId_date_platform_campaignExternalId_adGroupExternalId_term_matchType: identity },
      create: { ...identity, status: "import", ...metrics },
      update: metrics,
    });
  }
  return scoped.length;
}

function accountOnRow(row: { campaignExternalId: string; campaign: { adAccountId: string } | null }) {
  if (row.campaign?.adAccountId) return row.campaign.adAccountId;
  return row.campaignExternalId.startsWith("import:") ? row.campaignExternalId.slice("import:".length) : "";
}

export async function loadSearchTermRows(workspaceId: string, adAccountIds: "all" | string[], windowStart: string, windowEnd: string) {
  const accountWhere = adAccountIds === "all" ? {} : { campaign: { adAccountId: { in: adAccountIds } } };
  const stored = await prisma.searchTermMetric.findMany({
    where: isolatedWhere(workspaceId, { ...accountWhere, platform: "google_ads", date: { gte: day(windowStart), lte: day(windowEnd) } }),
    include: { campaign: { select: { name: true, adAccountId: true } }, adGroup: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  const imported = adAccountIds === "all" || adAccountIds.length === 0
    ? []
    : await prisma.searchTermMetric.findMany({
        where: isolatedWhere(workspaceId, {
          platform: "google_ads",
          campaignId: null,
          date: { gte: day(windowStart), lte: day(windowEnd) },
          OR: adAccountIds.map((id) => ({ campaignExternalId: `import:${id}` })),
        }),
        include: { campaign: { select: { name: true, adAccountId: true } }, adGroup: { select: { name: true } } },
        orderBy: { date: "asc" },
      });
  return [...stored, ...imported].map((row): SearchTermRow => ({
    workspaceId: row.workspaceId,
    adAccountId: accountOnRow(row),
    campaignId: row.campaignId,
    adGroupId: row.adGroupId,
    campaignName: row.campaign?.name || "",
    adGroupName: row.adGroup?.name || "",
    date: row.date.toISOString().slice(0, 10),
    term: row.term,
    matchType: storedMatch(row.matchType),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    spend: dec(row.spend),
    conversions: dec(row.conversions),
    qualifiedConversions: row.qualifiedConversions == null ? dec(row.conversions) : dec(row.qualifiedConversions),
    currency: row.currency,
  }));
}

function proposalKey(row: { adAccountId: string; scopeKey: string; term: string; matchType: string; windowStart: string }) {
  return [row.adAccountId, row.scopeKey, normalizeTerm(row.term), row.matchType, row.windowStart].join("\t");
}

export async function replaceProposedNegatives(workspaceId: string, drafts: NegativeProposalDraft[]) {
  const existing = await prisma.negativeProposal.findMany({ where: isolatedWhere(workspaceId) });
  const locked = new Set(existing.filter((row) => row.status !== "proposed").map((row) => proposalKey({
    adAccountId: row.adAccountId,
    scopeKey: row.scopeKey,
    term: row.term,
    matchType: row.matchType,
    windowStart: row.windowStart.toISOString().slice(0, 10),
  })));
  await prisma.negativeProposal.deleteMany({ where: isolatedWhere(workspaceId, { status: "proposed" }) });
  const fresh = drafts.filter((draft) => !locked.has(proposalKey(draft)));
  if (fresh.length) {
    await prisma.negativeProposal.createMany({
      data: fresh.map((draft) => ({
        workspaceId: isolatedWhere(workspaceId).workspaceId,
        adAccountId: draft.adAccountId,
        campaignId: draft.campaignId,
        adGroupId: draft.adGroupId,
        scopeKey: draft.scopeKey,
        campaignName: draft.campaignName,
        adGroupName: draft.adGroupName,
        term: normalizeTerm(draft.term),
        matchType: draft.matchType,
        level: draft.level,
        wasteSpend: draft.wasteSpend.toFixed(4),
        currency: draft.currency,
        clicks: draft.clicks,
        impressions: draft.impressions,
        reason: draft.reason,
        confidence: draft.confidence,
        status: "proposed" as const,
        safetyNote: draft.safetyNote,
        windowStart: day(draft.windowStart),
        windowEnd: day(draft.windowEnd),
      })),
    });
  }
  return fresh.length;
}

export async function listNegativeProposals(access: MarketingAccess) {
  const accounts = accountFilter(access);
  const rows = await prisma.negativeProposal.findMany({
    where: isolatedWhere(access.workspaceId, accounts === "all" ? {} : { adAccountId: { in: accounts } }),
    orderBy: [{ reason: "asc" }, { clicks: "desc" }, { term: "asc" }],
  });
  return rows.map((row) => presentProposal({
    id: row.id,
    workspaceId: row.workspaceId,
    adAccountId: row.adAccountId,
    campaignId: row.campaignId,
    adGroupId: row.adGroupId,
    scopeKey: row.scopeKey,
    campaignName: row.campaignName,
    adGroupName: row.adGroupName,
    term: row.term,
    matchType: row.matchType === "exact" ? "exact" : "phrase",
    level: row.level,
    wasteSpend: dec(row.wasteSpend),
    currency: row.currency,
    clicks: row.clicks,
    impressions: row.impressions,
    reason: row.reason as NegativeProposalDraft["reason"],
    reasonLabel: labelReason(row.reason),
    confidence: row.confidence === "high" || row.confidence === "medium" || row.confidence === "low" ? row.confidence : "low",
    defaultAction: row.status === "kept" ? "keep" : row.status === "exported" ? "block" : row.safetyNote || row.confidence !== "high" ? "keep" : "block",
    safetyNote: row.safetyNote,
    status: row.status,
    windowStart: row.windowStart.toISOString().slice(0, 10),
    windowEnd: row.windowEnd.toISOString().slice(0, 10),
  }, access.seesCost));
}

function labelReason(reason: string) {
  if (reason === "job_seekers") return "Job seekers";
  if (reason === "free_diy") return "Free/DIY";
  if (reason === "wrong_location") return "Wrong location";
  return "No qualified conversions";
}

export async function setProposalDisposition(workspaceId: string, id: string, disposition: "block" | "keep", userId: string) {
  const updated = await prisma.negativeProposal.updateMany({
    where: isolatedWhere(workspaceId, { id }),
    data: {
      status: disposition === "keep" ? "kept" : "proposed",
      decidedById: userId,
      decidedAt: new Date(),
      exportedAt: null,
    },
  });
  return updated.count;
}

export async function markProposalsExported(
  workspaceId: string,
  ids: string[],
  matchById: Record<string, "exact" | "phrase">,
  adAccountIds: "all" | string[] = "all",
) {
  const accountWhere = adAccountIds === "all" ? {} : { adAccountId: { in: adAccountIds } };
  const rows = await prisma.negativeProposal.findMany({
    where: isolatedWhere(workspaceId, { ...accountWhere, id: { in: ids }, status: { not: "kept" } }),
  });
  for (const row of rows) {
    const matchType: SearchMatchType = matchById[row.id] === "exact" ? "exact" : "phrase";
    await prisma.negativeProposal.updateMany({
      where: isolatedWhere(workspaceId, { id: row.id }),
      data: { status: "exported", exportedAt: new Date(), matchType },
    });
  }
  return rows;
}

export async function analyzeStoredSearchTerms(workspaceId: string, adAccountIds: "all" | string[], now = new Date()) {
  const config = await loadSearchWasteConfig(workspaceId);
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime());
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = startDate.toISOString().slice(0, 10);
  const rows = await loadSearchTermRows(workspaceId, adAccountIds, start, end);
  const drafts = findWastedSearchTerms(rows, {
    workspaceId,
    now,
    brandTerms: config?.brandTerms ?? [],
    otherLocations: config?.otherLocations ?? [],
  });
  await replaceProposedNegatives(workspaceId, drafts);
  return drafts.length;
}

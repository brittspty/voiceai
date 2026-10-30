import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { graphVersion } from "./config";
import type { Env } from "./config";
import { fetchAdLibraryAds } from "./connectors/ad-library";
import type { FetchLike } from "./connectors/meta-client";
import { cleanCompetitorInput, competitorAddDecision, draftIdeaFromAd, presentCompetitorAd, type CompetitorInput } from "./competitor-watch";
import { isolatedWhere } from "./workspace";

function dayStamp(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function listCompetitors(workspaceId: string) {
  return prisma.competitor.findMany({
    where: isolatedWhere(workspaceId),
    orderBy: { name: "asc" },
    include: {
      ads: { orderBy: { firstSeen: "desc" } },
    },
  });
}

export async function addCompetitor(workspaceId: string, userId: string, input: CompetitorInput) {
  const cleaned = cleanCompetitorInput(input);
  if (!cleaned.ok) return cleaned;
  const count = await prisma.competitor.count({ where: isolatedWhere(workspaceId) });
  const decision = competitorAddDecision(count);
  if (!decision.ok) return decision;
  const created = await prisma.competitor.create({
    data: {
      workspaceId: isolatedWhere(workspaceId).workspaceId,
      name: cleaned.value.name,
      pageId: cleaned.value.pageId,
      website: cleaned.value.website,
      searchTerms: cleaned.value.searchTerms,
      createdById: userId,
    },
  });
  return { ok: true as const, competitor: created };
}

export async function removeCompetitor(workspaceId: string, id: string) {
  const removed = await prisma.competitor.deleteMany({ where: isolatedWhere(workspaceId, { id }) });
  return removed.count;
}

export async function refreshCompetitorAds(workspaceId: string, env: Env = process.env, fetchImpl?: FetchLike, now = new Date()) {
  const competitors = await prisma.competitor.findMany({ where: isolatedWhere(workspaceId), orderBy: { name: "asc" } });
  const token = (env.META_ACCESS_TOKEN || "").trim();
  const appSecret = (env.META_APP_SECRET || "").trim();
  const countries = (env.META_AD_LIBRARY_COUNTRIES || "US").split(",").map((part) => part.trim().toUpperCase()).filter((part) => /^[A-Z]{2}$/.test(part));
  let loaded = 0;
  for (const competitor of competitors) {
    const searchTerms = [competitor.name, ...competitor.searchTerms].filter(Boolean).join(" ");
    const result = await fetchAdLibraryAds({
      version: graphVersion(env),
      token,
      appSecret,
      countries: countries.length ? countries : ["US"],
      searchTerms: competitor.pageId ? "" : searchTerms,
      pageIds: competitor.pageId ? [competitor.pageId] : [],
      competitorName: competitor.name,
      fetchImpl,
      now,
    });
    if (!result.ok) {
      await prisma.competitor.updateMany({
        where: isolatedWhere(workspaceId, { id: competitor.id }),
        data: { lastError: result.message, lastFetchedAt: now },
      });
      continue;
    }
    for (const ad of result.ads) {
      const creative = ad.creative;
      await prisma.competitorAd.upsert({
        where: {
          competitorAdExternal: {
            workspaceId: isolatedWhere(workspaceId).workspaceId,
            competitorId: competitor.id,
            externalId: ad.externalId,
          },
        },
        create: {
          workspaceId: isolatedWhere(workspaceId).workspaceId,
          competitorId: competitor.id,
          externalId: ad.externalId,
          source: "meta_ad_library",
          pageName: ad.pageName,
          headline: ad.headline,
          body: ad.body,
          snapshotUrl: ad.snapshotUrl,
          firstSeen: dayStamp(ad.firstSeen),
          lastSeen: dayStamp(ad.lastSeen),
          active: ad.active,
          creative: creative as Prisma.InputJsonValue,
          fetchedAt: now,
        },
        update: {
          pageName: ad.pageName,
          headline: ad.headline,
          body: ad.body,
          snapshotUrl: ad.snapshotUrl,
          lastSeen: dayStamp(ad.lastSeen),
          active: ad.active,
          creative: creative as Prisma.InputJsonValue,
          fetchedAt: now,
        },
      });
      loaded += 1;
    }
    await prisma.competitor.updateMany({
      where: isolatedWhere(workspaceId, { id: competitor.id }),
      data: { lastError: "", lastFetchedAt: now },
    });
  }
  return { competitors: competitors.length, ads: loaded };
}

export async function createCompetitorIdea(workspaceId: string, userId: string, competitorAdId: string) {
  const ad = await prisma.competitorAd.findFirst({ where: isolatedWhere(workspaceId, { id: competitorAdId }) });
  if (!ad) return { ok: false as const, message: "That ad is not in this workspace." };
  const draft = draftIdeaFromAd(ad);
  const idea = await prisma.competitorIdea.create({
    data: {
      workspaceId: isolatedWhere(workspaceId).workspaceId,
      competitorAdId: ad.id,
      headline: draft.headline,
      body: draft.body,
      status: draft.status,
      createdById: userId,
    },
  });
  return { ok: true as const, idea };
}

export function cardsForCompetitors(
  competitors: Awaited<ReturnType<typeof listCompetitors>>,
  now = new Date(),
) {
  return competitors.flatMap((competitor) => competitor.ads.map((ad) => presentCompetitorAd({
    id: ad.id,
    competitorName: competitor.name,
    now,
    ad: {
      headline: ad.headline,
      body: ad.body,
      pageName: ad.pageName,
      snapshotUrl: ad.snapshotUrl,
      firstSeen: ad.firstSeen.toISOString().slice(0, 10),
      active: ad.active,
    },
    })));
}

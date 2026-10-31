import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { audienceLibraryEnabled, type Env } from "../config";
import { isolatedWhere } from "../workspace";
import type { MaidImport, RefreshCadence } from "./import";
import type { LibraryAudience } from "./library";
import { assertHumanPushActor, applyPushDecision, deliverAudienceUpload, finalizePush, normalizeAudienceDecision, prepareAudiencePush } from "./push";
import { attributeConversion, retargetingPool } from "./pixel";
import { dryRunPoolSync, PIXEL_FIX_GUIDE, pixelPageHealth, poolGrowth, POOL_SYNC_PLATFORMS, type PoolSyncPlatform } from "./pixel-health";
import type { AudiencePlatform } from "./payloads";
import type { AudienceSource, SegmentDimension } from "../segment-taxonomy";

function day(value: Date | null) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function decimal(value: { toString(): string } | null | undefined) {
  if (value === null || value === undefined) return null;
  const amount = Number(value.toString());
  if (!Number.isFinite(amount)) return null;
  return amount.toFixed(4);
}

function numberAmount(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const amount = Number(value.toString());
  return Number.isFinite(amount) ? amount : 0;
}

export async function importMaidAudience(workspaceId: string, imported: MaidImport, env: Env = process.env) {
  if (!audienceLibraryEnabled(env)) return { ok: false as const, message: "The audience library is off." };
  const id = await prisma.$transaction(async (tx) => {
    const scope = isolatedWhere(workspaceId, { vendor: imported.lineage.vendor, listId: imported.lineage.listId });
    const existing = await tx.maidAudience.findFirst({ where: scope });
    const data = {
      name: imported.name,
      source: imported.source,
      vendor: imported.lineage.vendor,
      listId: imported.lineage.listId,
      acquisitionDate: imported.lineage.acquisitionDate ? new Date(`${imported.lineage.acquisitionDate}T00:00:00.000Z`) : null,
      costAmount: imported.lineage.cost,
      costCurrency: imported.lineage.currency,
      consentBasis: imported.lineage.consentBasis,
      refreshCadence: imported.lineage.refreshCadence,
    };
    const audienceId = existing
      ? existing.id
      : (await tx.maidAudience.create({ data: { ...isolatedWhere(workspaceId), ...data } })).id;
    if (existing) {
      await tx.maidAudience.updateMany({ where: isolatedWhere(workspaceId, { id: existing.id }), data });
    }
    await tx.maidAudienceTag.deleteMany({ where: isolatedWhere(workspaceId, { audienceId }) });
    if (imported.tags.length) {
      await tx.maidAudienceTag.createMany({
        data: imported.tags.map((tag) => ({
          ...isolatedWhere(workspaceId),
          audienceId,
          dimension: tag.dimension,
          key: tag.key,
          label: tag.label,
        })),
      });
    }
    const existingMembers = await tx.maidIdentifier.findMany({
      where: isolatedWhere(workspaceId, { audienceId }),
      select: { idType: true, hash: true },
    });
    const have = new Set(existingMembers.map((member) => `${member.idType}:${member.hash}`));
    const fresh = imported.identifiers.filter((member) => !have.has(`${member.idType}:${member.hash}`));
    if (fresh.length) {
      await tx.maidIdentifier.createMany({
        data: fresh.map((member) => ({
          ...isolatedWhere(workspaceId),
          audienceId,
          idType: member.idType,
          hash: member.hash,
          rawEncrypted: member.rawEncrypted,
        })),
      });
    }
    return audienceId;
  });
  return { ok: true as const, id, duplicates: imported.duplicates, rejected: imported.rejected };
}

export async function listLibraryAudiences(workspaceId: string, env: Env = process.env): Promise<LibraryAudience[]> {
  if (!audienceLibraryEnabled(env)) return [];
  const [rows, pixels] = await Promise.all([
    prisma.maidAudience.findMany({
      where: isolatedWhere(workspaceId),
      include: {
        _count: { select: { members: true } },
        tags: true,
        platformStats: true,
        conversions: { select: { status: true, kind: true, qualified: true } },
        pushes: { select: { id: true, platform: true, status: true, undoUntil: true }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.audiencePixelEvent.findMany({
      where: isolatedWhere(workspaceId),
      select: { audienceId: true, visitorId: true },
    }),
  ]);
  const visitors = new Map<string, Set<string>>();
  for (const event of pixels) {
    const set = visitors.get(event.audienceId) ?? new Set<string>();
    if (event.visitorId) set.add(event.visitorId);
    visitors.set(event.audienceId, set);
  }
  return rows.map((row) => {
    const verified = row.conversions.filter((item) => item.status === "verified");
    return {
      id: row.id,
      name: row.name,
      source: row.source as AudienceSource,
      vendor: row.vendor,
      listId: row.listId,
      consentBasis: row.consentBasis,
      refreshCadence: row.refreshCadence as RefreshCadence,
      acquisitionDate: day(row.acquisitionDate),
      cost: decimal(row.costAmount),
      size: row._count.members,
      tags: row.tags.map((tag) => ({ dimension: tag.dimension as SegmentDimension, key: tag.key, label: tag.label })),
      platforms: row.platformStats.map((stat) => ({
        platform: stat.platform as AudiencePlatform,
        uploaded: stat.uploaded,
        matched: stat.matched,
        reach: stat.reach,
        spend: numberAmount(stat.spend),
      })),
      verifiedConversions: verified.length,
      verifiedLeads: verified.filter((item) => item.kind === "lead").length,
      qualifiedLeads: verified.filter((item) => item.qualified).length,
      pixelVisitors: visitors.get(row.id)?.size ?? 0,
      pushes: row.pushes.map((push) => ({
        id: push.id,
        platform: push.platform as AudiencePlatform,
        status: push.status,
        undoUntil: push.undoUntil ? push.undoUntil.toISOString() : null,
      })),
    };
  });
}

export async function recordPlatformMatch(input: {
  workspaceId: string;
  audienceId: string;
  platform: AudiencePlatform;
  uploaded: number;
  matched: number;
  reach: number;
  spend: number;
  env?: Env;
}) {
  if (!audienceLibraryEnabled(input.env)) return { ok: false as const, message: "The audience library is off." };
  const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(input.workspaceId, { id: input.audienceId }) });
  if (!audience) return { ok: false as const, message: "Audience not found." };
  if (input.uploaded < 0 || input.matched < 0 || input.reach < 0 || input.spend < 0 || input.matched > input.uploaded) {
    return { ok: false as const, message: "Match counts must be zero or more, and matched cannot exceed uploaded." };
  }
  await prisma.audiencePlatformStat.upsert({
    where: { audienceId_platform: { audienceId: audience.id, platform: input.platform } },
    create: {
      ...isolatedWhere(input.workspaceId),
      audienceId: audience.id,
      platform: input.platform,
      uploaded: input.uploaded,
      matched: input.matched,
      reach: input.reach,
      spend: input.spend.toFixed(4),
    },
    update: {
      uploaded: input.uploaded,
      matched: input.matched,
      reach: input.reach,
      spend: input.spend.toFixed(4),
    },
  });
  return { ok: true as const };
}

export async function requestAudiencePush(input: {
  workspaceId: string;
  audienceId: string;
  platform: AudiencePlatform;
  actorId: string;
  env?: Env;
}) {
  if (!audienceLibraryEnabled(input.env)) return { ok: false as const, message: "The audience library is off." };
  assertHumanPushActor({ kind: "human" });
  const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(input.workspaceId, { id: input.audienceId }) });
  if (!audience) return { ok: false as const, message: "Audience not found." };
  const members = await prisma.maidIdentifier.findMany({
    where: isolatedWhere(input.workspaceId, { audienceId: audience.id }),
    select: { idType: true, hash: true },
  });
  try {
    const payload = prepareAudiencePush({
      source: audience.source as AudienceSource,
      platform: input.platform,
      members,
      consentBasis: audience.consentBasis,
      env: input.env,
    });
    const push = await prisma.audiencePush.create({
      data: {
        ...isolatedWhere(input.workspaceId),
        audienceId: audience.id,
        platform: input.platform,
        status: "pending",
        payload: payload as Prisma.InputJsonValue,
        requestedById: input.actorId,
      },
    });
    return { ok: true as const, id: push.id };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Push was refused." };
  }
}

export async function decideAudiencePush(input: {
  workspaceId: string;
  pushId: string;
  decision: string;
  actorId: string;
  env?: Env;
  now?: Date;
}) {
  if (!audienceLibraryEnabled(input.env)) return { ok: false as const, message: "The audience library is off." };
  assertHumanPushActor({ kind: "human" });
  const action = normalizeAudienceDecision(input.decision);
  if (!action) return { ok: false as const, message: "Choose Yes or No." };
  const now = input.now ?? new Date();
  const push = await prisma.audiencePush.findFirst({ where: isolatedWhere(input.workspaceId, { id: input.pushId }) });
  if (!push) return { ok: false as const, message: "That push is not waiting for a decision." };
  const next = applyPushDecision({
    status: push.status,
    undoUntil: push.undoUntil ? push.undoUntil.toISOString() : null,
    log: push.logLine,
    steps: push.manualSteps ? push.manualSteps.split("\n") : [],
    finalized: push.status === "approved" && !push.undoUntil,
  }, action, now);
  if (next.status === push.status && next.undoUntil === (push.undoUntil ? push.undoUntil.toISOString() : null)) {
    return { ok: false as const, message: "That decision is no longer open." };
  }
  await prisma.audiencePush.updateMany({
    where: isolatedWhere(input.workspaceId, { id: push.id }),
    data: {
      status: next.status,
      undoUntil: next.undoUntil ? new Date(next.undoUntil) : null,
      logLine: next.log,
      manualSteps: next.steps.join("\n"),
      decidedById: next.status === "pending" ? null : input.actorId,
      decidedAt: next.status === "pending" ? null : now,
    },
  });
  return { ok: true as const, mode: "dry_run" as const, called: false, log: next.log, steps: next.steps };
}

export async function finalizeDuePushes(workspaceId: string, env: Env = process.env, now = new Date()) {
  if (!audienceLibraryEnabled(env)) return { logged: 0 };
  const due = await prisma.audiencePush.findMany({
    where: isolatedWhere(workspaceId, { status: "approved", undoUntil: { lte: now } }),
  });
  let logged = 0;
  for (const push of due) {
    const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(workspaceId, { id: push.audienceId }) });
    if (!audience) continue;
    const members = await prisma.maidIdentifier.findMany({
      where: isolatedWhere(workspaceId, { audienceId: audience.id }),
      select: { idType: true, hash: true },
    });
    let payload: unknown = push.payload;
    try {
      payload = prepareAudiencePush({
        source: audience.source as AudienceSource,
        platform: push.platform as AudiencePlatform,
        members,
        consentBasis: audience.consentBasis,
        env,
      });
    } catch {
      payload = push.payload;
    }
    const delivery = await deliverAudienceUpload({
      env,
      platform: push.platform as AudiencePlatform,
      payload,
      listId: audience.listId,
      vendor: audience.vendor,
    });
    const finalized = finalizePush({
      status: "approved",
      undoUntil: push.undoUntil ? push.undoUntil.toISOString() : null,
      log: push.logLine,
      steps: [],
      finalized: false,
    }, now, delivery);
    if (!finalized.write) continue;
    await prisma.audiencePush.updateMany({
      where: isolatedWhere(workspaceId, { id: push.id }),
      data: {
        undoUntil: null,
        payload: payload as Prisma.InputJsonValue,
        logLine: finalized.card.log,
        manualSteps: finalized.card.steps.join("\n"),
      },
    });
    logged += 1;
  }
  return { logged };
}

export async function listAudiencePushes(workspaceId: string, env: Env = process.env) {
  if (!audienceLibraryEnabled(env)) return [];
  const rows = await prisma.audiencePush.findMany({
    where: isolatedWhere(workspaceId),
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { audience: { select: { name: true, listId: true, vendor: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    audienceId: row.audienceId,
    name: row.audience.name,
    listId: row.audience.listId,
    vendor: row.audience.vendor,
    platform: row.platform as AudiencePlatform,
    status: row.status,
    undoUntil: row.undoUntil ? row.undoUntil.toISOString() : null,
    manualSteps: row.manualSteps ? row.manualSteps.split("\n") : [],
    logLine: row.logLine,
  }));
}

export async function recordPixelEvent(input: {
  workspaceId: string;
  audienceId: string;
  visitorId: string;
  eventName: string;
  pageUrl?: string;
  occurredAt?: Date;
  env?: Env;
}) {
  if (!audienceLibraryEnabled(input.env)) return { ok: false as const, message: "The audience library is off." };
  const visitorId = input.visitorId.trim();
  const eventName = input.eventName.trim();
  if (!visitorId || !eventName) return { ok: false as const, message: "A pixel event needs a visitor and an event name." };
  const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(input.workspaceId, { id: input.audienceId }) });
  if (!audience) return { ok: false as const, message: "Audience not found." };
  await prisma.audiencePixelEvent.create({
    data: {
      ...isolatedWhere(input.workspaceId),
      audienceId: audience.id,
      visitorId,
      eventName,
      pageUrl: (input.pageUrl || "").trim().slice(0, 500),
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
  return { ok: true as const };
}

export async function listPixelBoard(workspaceId: string, env: Env = process.env, now = new Date()) {
  if (!audienceLibraryEnabled(env)) return null;
  const [pages, events, audiences] = await Promise.all([
    prisma.landingPage.findMany({ where: isolatedWhere(workspaceId), select: { name: true, url: true } }),
    prisma.audiencePixelEvent.findMany({
      where: isolatedWhere(workspaceId),
      select: { pageUrl: true, eventName: true, visitorId: true, audienceId: true, occurredAt: true },
    }),
    prisma.maidAudience.findMany({ where: isolatedWhere(workspaceId), select: { id: true, name: true, listId: true } }),
  ]);
  const rows = events.map((event) => ({
    pageUrl: event.pageUrl,
    eventName: event.eventName,
    visitorId: event.visitorId,
    audienceId: event.audienceId,
    occurredAt: event.occurredAt.toISOString(),
  }));
  return {
    pages: pixelPageHealth({ pages, events: rows, now }),
    pools: poolGrowth({ audiences, events: rows, now }),
    guide: PIXEL_FIX_GUIDE,
    eventsCaptured: rows.length,
  };
}

export async function logPoolSync(input: { workspaceId: string; audienceId: string; actorId: string; env?: Env }) {
  if (!audienceLibraryEnabled(input.env)) return { ok: false as const, message: "The audience library is off." };
  assertHumanPushActor({ kind: "human" });
  const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(input.workspaceId, { id: input.audienceId }) });
  if (!audience) return { ok: false as const, message: "Audience not found." };
  const events = await prisma.audiencePixelEvent.findMany({
    where: isolatedWhere(input.workspaceId, { audienceId: audience.id }),
    select: { visitorId: true },
  });
  const visitorIds = [...new Set(events.map((event) => event.visitorId).filter(Boolean))];
  const logs = [];
  for (const platform of POOL_SYNC_PLATFORMS) {
    const sync = dryRunPoolSync({ platform: platform as PoolSyncPlatform, visitorIds, listId: audience.listId, vendor: audience.vendor });
    await prisma.audiencePush.create({
      data: {
        ...isolatedWhere(input.workspaceId),
        audienceId: audience.id,
        platform,
        status: "approved",
        payload: sync.payload as Prisma.InputJsonValue,
        manualSteps: sync.steps.join("\n"),
        logLine: sync.log,
        requestedById: input.actorId,
        decidedById: input.actorId,
        decidedAt: new Date(),
      },
    });
    logs.push({ platform, log: sync.log, called: sync.called });
  }
  return { ok: true as const, logs };
}

export async function listRetargetingPool(workspaceId: string, audienceId: string, env: Env = process.env) {
  if (!audienceLibraryEnabled(env)) return [];
  const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(workspaceId, { id: audienceId }) });
  if (!audience) return [];
  const events = await prisma.audiencePixelEvent.findMany({
    where: isolatedWhere(workspaceId, { audienceId: audience.id }),
    select: { audienceId: true, visitorId: true, eventName: true, occurredAt: true },
  });
  return retargetingPool(
    events.map((event) => ({
      audienceId: event.audienceId,
      visitorId: event.visitorId,
      eventName: event.eventName,
      occurredAt: event.occurredAt.toISOString(),
    })),
    audience.id,
  );
}

export async function recordAudienceConversion(input: {
  workspaceId: string;
  audienceId: string;
  visitorId: string;
  externalId: string;
  kind: "lead" | "sale";
  qualified: boolean;
  maid?: string;
  idType?: "idfa" | "gaid";
  email?: string;
  phone?: string;
  emailSha256?: string;
  phoneSha256?: string;
  env?: Env;
}) {
  if (!audienceLibraryEnabled(input.env)) return { ok: false as const, message: "The audience library is off." };
  const audience = await prisma.maidAudience.findFirst({ where: isolatedWhere(input.workspaceId, { id: input.audienceId }) });
  if (!audience) return { ok: false as const, message: "Audience not found." };
  const prior = await prisma.audienceConversion.findMany({
    where: isolatedWhere(input.workspaceId, { audienceId: audience.id, status: "verified" }),
    select: { dedupeKey: true },
  });
  const seen = new Set(prior.map((row) => row.dedupeKey));
  const attributed = attributeConversion({
    audienceId: audience.id,
    source: audience.source as AudienceSource,
    visitorId: input.visitorId,
    externalId: input.externalId,
    kind: input.kind,
    qualified: input.qualified,
    maid: input.maid,
    idType: input.idType,
    email: input.email,
    phone: input.phone,
    emailSha256: input.emailSha256,
    phoneSha256: input.phoneSha256,
  }, seen);
  if (attributed.status === "unverified" && attributed.reason === "Duplicate conversion.") {
    return { ok: true as const, conversion: attributed };
  }
  try {
    await prisma.audienceConversion.create({
      data: {
        ...isolatedWhere(input.workspaceId),
        audienceId: audience.id,
        dedupeKey: attributed.dedupeKey,
        kind: attributed.kind,
        status: attributed.status,
        reason: attributed.reason,
        qualified: attributed.status === "verified" && attributed.qualified,
        contactHash: attributed.contactHash,
      },
    });
  } catch {
    return {
      ok: true as const,
      conversion: { ...attributed, status: "unverified" as const, reason: "Duplicate conversion.", qualified: false },
    };
  }
  return { ok: true as const, conversion: attributed };
}

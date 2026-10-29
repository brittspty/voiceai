import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { zonedDayBounds } from "../time";
import { WORKSPACE_ID } from "./types";
import { speedToLeadEnabled, type Env } from "./config";
import type { DigestItem } from "./digest";
import {
  LANDING_MATCH_MS,
  businessWindow,
  canNotify,
  clampTarget,
  describeLead,
  normalizeSla,
  planSpeedToLead,
  resolveClock,
  touchSeconds,
  undoStillOpen,
  usableStamp,
  type ClockSource,
  type SpeedLead,
  type TouchChannel,
} from "./speed-to-lead";

type StoredLead = Prisma.LeadResponseGetPayload<{ include: { alerts: true } }>;

function sessionKeys(input: { sessionKey?: string | null; phone?: string | null; email?: string | null; ghlId?: string | null }) {
  const keys = [input.sessionKey, input.phone, input.email, input.ghlId]
    .map((value) => (value || "").trim().slice(0, 120))
    .filter(Boolean);
  return [...new Set(keys)];
}

function earliestDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function isUnique(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

async function workspaceZone() {
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
  return org?.timezone || "America/New_York";
}

async function loadSla() {
  const zone = await workspaceZone();
  const row = await prisma.clientSla.findUnique({ where: { workspaceId: WORKSPACE_ID } });
  if (!row) return normalizeSla(null, zone);
  return normalizeSla(
    {
      targetSeconds: row.targetSeconds,
      criticalSeconds: row.criticalSeconds,
      openTime: row.openTime,
      closeTime: row.closeTime,
      timeZone: row.timezone,
    },
    zone,
  );
}

async function earliestLanding(keys: string[], now: Date) {
  if (!keys.length) return null;
  const row = await prisma.leadLanding.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      sessionKey: { in: keys },
      landedAt: { gte: new Date(now.getTime() - LANDING_MATCH_MS), lte: new Date(now.getTime() + 5 * 60 * 1000) },
    },
    orderBy: { landedAt: "asc" },
  });
  return row?.landedAt ?? null;
}

function toSpeedLead(row: StoredLead): SpeedLead {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    phone: row.phone,
    leadSource: row.leadSource,
    clockStartAt: row.clockStartAt,
    clockSource: row.clockSource,
    slaStartAt: row.slaStartAt,
    afterHours: row.afterHours,
    firstTouchAt: row.firstTouchAt,
    channel: row.channel,
    seconds: row.seconds,
    mutedUntil: row.mutedUntil,
    landedAt: row.landedAt,
    submittedAt: row.submittedAt,
    callStartedAt: row.callStartedAt,
    alerts: row.alerts.flatMap((alert) =>
      alert.severity === "warning" || alert.severity === "critical"
        ? [{ severity: alert.severity, state: alert.state }]
        : [],
    ),
  };
}

export async function recordLanding(
  input: { sessionKey?: string | null; phone?: string | null; email?: string | null; landedAt?: unknown; now?: Date },
  env: Env = process.env,
) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const };
  const now = input.now ?? new Date();
  const landedAt = usableStamp(input.landedAt, now) ?? now;
  const keys = sessionKeys(input);
  if (!keys.length) return { status: "invalid" as const };
  for (const key of keys) {
    const recent = await prisma.leadLanding.findFirst({
      where: { workspaceId: WORKSPACE_ID, sessionKey: key, landedAt: { gte: new Date(landedAt.getTime() - 30 * 60 * 1000) } },
    });
    if (!recent) await prisma.leadLanding.create({ data: { workspaceId: WORKSPACE_ID, sessionKey: key, landedAt } });
  }
  await backfillLanding(keys, landedAt);
  return { status: "stored" as const };
}

async function backfillLanding(keys: string[], landedAt: Date) {
  const open = await prisma.leadResponse.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      firstTouchAt: null,
      landedAt: null,
      OR: [{ sessionKey: { in: keys } }, { phone: { in: keys } }, { email: { in: keys } }],
    },
  });
  const sla = await loadSla();
  for (const row of open) {
    if (landedAt.getTime() >= row.clockStartAt.getTime()) continue;
    const window = businessWindow(landedAt, sla.timeZone, sla.openTime, sla.closeTime);
    await prisma.leadResponse.update({
      where: { id: row.id },
      data: {
        landedAt,
        clockStartAt: landedAt,
        clockSource: "landing",
        slaStartAt: window.slaStartAt,
        afterHours: window.afterHours,
      },
    });
  }
}

export async function recordSpeedLead(
  input: {
    contactId?: string | null;
    callId?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    sessionKey?: string | null;
    ghlId?: string | null;
    leadSource?: string | null;
    landedAt?: unknown;
    submittedAt?: unknown;
    callStartedAt?: unknown;
    now?: Date;
  },
  env: Env = process.env,
) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const };
  const now = input.now ?? new Date();
  const keys = sessionKeys(input);
  if (!input.contactId && !keys.length) return { status: "invalid" as const };
  const stored = await earliestLanding(keys, now);
  const clock = resolveClock({
    landedAt: earliestDate(usableStamp(input.landedAt, now), stored),
    submittedAt: input.submittedAt,
    callStartedAt: input.callStartedAt,
    now,
  });
  const sla = await loadSla();
  const window = businessWindow(clock.clockStartAt, sla.timeZone, sla.openTime, sla.closeTime);
  const open = await prisma.leadResponse.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      firstTouchAt: null,
      OR: [
        ...(input.contactId ? [{ contactId: input.contactId }] : []),
        ...(keys.length ? [{ phone: { in: keys } }, { email: { in: keys } }, { sessionKey: { in: keys } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (open) {
    if (!open.landedAt && clock.landedAt && clock.landedAt.getTime() < open.clockStartAt.getTime()) {
      await prisma.leadResponse.update({
        where: { id: open.id },
        data: {
          landedAt: clock.landedAt,
          clockStartAt: clock.clockStartAt,
          clockSource: clock.clockSource,
          slaStartAt: window.slaStartAt,
          afterHours: window.afterHours,
          sessionKey: open.sessionKey || input.sessionKey || "",
        },
      });
    }
    return { status: "open" as const, id: open.id };
  }
  const created = await prisma.leadResponse.create({
    data: {
      workspaceId: WORKSPACE_ID,
      contactId: input.contactId || null,
      callId: input.callId || null,
      name: (input.name || "").trim() || "New lead",
      phone: (input.phone || "").trim(),
      email: (input.email || "").trim(),
      sessionKey: (input.sessionKey || input.ghlId || "").trim().slice(0, 120),
      leadSource: (input.leadSource || (input.callStartedAt && !input.submittedAt ? "Call" : "Form")).slice(0, 120),
      landedAt: clock.landedAt,
      submittedAt: clock.submittedAt,
      callStartedAt: clock.callStartedAt,
      clockStartAt: clock.clockStartAt,
      clockSource: clock.clockSource,
      slaStartAt: window.slaStartAt,
      afterHours: window.afterHours,
    },
  });
  return { status: "created" as const, id: created.id };
}

async function findStored(id: string) {
  return prisma.leadResponse.findFirst({ where: { id, workspaceId: WORKSPACE_ID }, include: { alerts: true } });
}

async function closeLead(id: string, at: Date, channel: TouchChannel, touchedById: string | null, note: string, callId?: string | null) {
  const row = await findStored(id);
  if (!row || row.firstTouchAt) return { status: "already" as const };
  const seconds = touchSeconds(row.slaStartAt, at);
  await prisma.leadResponse.update({
    where: { id },
    data: {
      firstTouchAt: at,
      channel,
      seconds,
      touchedById,
      ...(callId ? { callId } : {}),
    },
  });
  await prisma.leadAlert.updateMany({
    where: { leadResponseId: id, state: "open" },
    data: { state: "resolved", resolvedAt: at, resolveNote: "Resolved" },
  });
  if (row.recommendationId) {
    await prisma.recommendation.update({
      where: { id: row.recommendationId },
      data: { status: "accepted", decisionNote: note, decidedAt: at, decidedById: touchedById },
    });
  }
  return { status: "closed" as const, seconds };
}

export async function noteVoiceTouch(input: { contactId: string; at?: Date; callId?: string | null }, env: Env = process.env) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const };
  const open = await prisma.leadResponse.findFirst({
    where: { workspaceId: WORKSPACE_ID, contactId: input.contactId, firstTouchAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!open) return { status: "none" as const };
  await closeLead(open.id, input.at ?? new Date(), "voice_ai", null, "Resolved", input.callId);
  return { status: "touched" as const, id: open.id };
}

export async function markSpeedContacted(id: string, userId: string, env: Env = process.env) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const };
  const row = await prisma.leadResponse.findFirst({ where: { id, workspaceId: WORKSPACE_ID } });
  if (!row) return { status: "missing" as const };
  if (row.firstTouchAt) return { status: "already" as const };
  await closeLead(id, new Date(), "human", userId, "contacted");
  return { status: "contacted" as const };
}

export async function undoSpeedContact(id: string, userId: string, now = new Date(), env: Env = process.env) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const };
  const row = await prisma.leadResponse.findFirst({ where: { id, workspaceId: WORKSPACE_ID } });
  if (!row || row.channel !== "human" || row.touchedById !== userId || !undoStillOpen(row.firstTouchAt, now)) {
    return { status: "closed" as const };
  }
  await prisma.leadResponse.update({
    where: { id },
    data: { firstTouchAt: null, channel: null, seconds: null, touchedById: null },
  });
  await prisma.leadAlert.updateMany({
    where: { leadResponseId: id, state: "resolved", resolveNote: "Resolved" },
    data: { state: "open", resolvedAt: null, resolveNote: "" },
  });
  if (row.recommendationId) {
    await prisma.recommendation.update({
      where: { id: row.recommendationId },
      data: { status: "verified", decisionNote: "", decidedById: null, decidedAt: null },
    });
  }
  return { status: "undone" as const };
}

export async function muteSpeedLead(id: string, userId: string, env: Env = process.env) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const };
  const row = await prisma.leadResponse.findFirst({ where: { id, workspaceId: WORKSPACE_ID } });
  if (!row || row.firstTouchAt) return { status: "closed" as const };
  const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.leadResponse.update({ where: { id }, data: { mutedUntil: until } });
  await prisma.leadAlert.updateMany({ where: { leadResponseId: id, state: "open" }, data: { state: "muted" } });
  if (row.recommendationId) {
    await prisma.recommendation.update({
      where: { id: row.recommendationId },
      data: { status: "dismissed", decisionNote: "Muted for 24h", decidedById: userId, decidedAt: new Date() },
    });
  }
  return { status: "muted" as const };
}

export async function saveSpeedTarget(seconds: number, env: Env = process.env) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const, targetSeconds: clampTarget(seconds) };
  const targetSeconds = clampTarget(seconds);
  const zone = await workspaceZone();
  await prisma.clientSla.upsert({
    where: { workspaceId: WORKSPACE_ID },
    create: { workspaceId: WORKSPACE_ID, targetSeconds, timezone: zone },
    update: { targetSeconds },
  });
  return { status: "saved" as const, targetSeconds };
}

function evidence(row: { id: string; clockSource: ClockSource; landedAt: Date | null; clockStartAt: Date; firstTouchAt: Date | null }) {
  return {
    leadId: row.id,
    feature: "speed_to_lead",
    clockSource: row.clockSource,
    landedAt: row.landedAt ? row.landedAt.toISOString() : null,
    clockStartAt: row.clockStartAt.toISOString(),
    firstTouchAt: row.firstTouchAt ? row.firstTouchAt.toISOString() : null,
  } satisfies Prisma.InputJsonObject;
}

async function applyPlan(row: StoredLead, plan: ReturnType<typeof planSpeedToLead>["plans"][number], now: Date) {
  let created = 0;
  if (plan.resolve) {
    await prisma.leadAlert.updateMany({
      where: { leadResponseId: row.id, state: "open" },
      data: { state: "resolved", resolvedAt: now, resolveNote: "Resolved" },
    });
    if (row.recommendationId) {
      await prisma.recommendation.update({
        where: { id: row.recommendationId },
        data: { status: "accepted", decisionNote: "Resolved", decidedAt: now },
      });
    }
    return created;
  }
  for (const fire of plan.fires) {
    try {
      await prisma.leadAlert.create({
        data: {
          workspaceId: row.workspaceId,
          leadResponseId: row.id,
          severity: fire.severity,
          code: fire.code,
          title: fire.title,
          summary: fire.summary,
          dedupeKey: fire.dedupeKey,
          state: "open",
          detectedAt: now,
        },
      });
      created += 1;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  if (!plan.card) return created;
  const data = {
    title: plan.card.title,
    summary: plan.card.summary,
    observed: plan.card.observed,
    baseline: plan.card.baseline,
    evidence: evidence(row),
  };
  if (!row.recommendationId) {
    const recommendation = await prisma.recommendation.create({
      data: {
        workspaceId: row.workspaceId,
        type: "speed_to_lead",
        status: "verified",
        title: data.title,
        summary: data.summary,
        rationale: "Call the lead or mark them contacted. This does not change an ad or a budget.",
        metric: "seconds_to_lead",
        baseline: data.baseline,
        observed: data.observed,
        sampleSize: 1,
        evidence: data.evidence,
        verifiedAt: now,
        verifierNote: "No contact is logged inside the target.",
      },
    });
    await prisma.leadResponse.update({ where: { id: row.id }, data: { recommendationId: recommendation.id } });
    return created;
  }
  const current = await prisma.recommendation.findUnique({ where: { id: row.recommendationId }, select: { observed: true, status: true } });
  if (current?.status === "verified" && current.observed !== data.observed) {
    await prisma.recommendation.update({ where: { id: row.recommendationId }, data });
  }
  return created;
}

async function recordPushSlots(severity: "warning" | "critical", now: Date, sla: Awaited<ReturnType<typeof loadSla>>) {
  const users = await prisma.user.findMany({
    where: { role: { in: ["account_manager", "super_admin"] } },
    select: { id: true },
  });
  for (const user of users) {
    const last = await prisma.speedNotify.findFirst({
      where: { workspaceId: WORKSPACE_ID, userId: user.id },
      orderBy: { pushedAt: "desc" },
    });
    if (!canNotify({ severity, now, timeZone: sla.timeZone, openTime: sla.openTime, closeTime: sla.closeTime, lastPushAt: last?.pushedAt ?? null })) continue;
    await prisma.speedNotify.create({ data: { workspaceId: WORKSPACE_ID, userId: user.id, pushedAt: now, severity } });
  }
}

export async function runSpeedToLeadSweep(now = new Date(), env: Env = process.env) {
  if (!speedToLeadEnabled(env)) return { status: "skipped" as const, alerts: 0 };
  const sla = await loadSla();
  const rows = await prisma.leadResponse.findMany({
    where: { workspaceId: WORKSPACE_ID, OR: [{ firstTouchAt: null }, { alerts: { some: { state: "open" } } }] },
    include: { alerts: true },
  });
  const { plans } = planSpeedToLead(rows.map(toSpeedLead), sla, now);
  let alerts = 0;
  const fired: ("warning" | "critical")[] = [];
  for (const plan of plans) {
    const row = rows.find((item) => item.id === plan.leadId);
    if (!row) continue;
    try {
      alerts += await applyPlan(row, plan, now);
      for (const fire of plan.fires) fired.push(fire.severity);
    } catch (error) {
      console.error("[speed-to-lead] sweep failed", plan.leadId, error);
    }
  }
  if (fired.length) await recordPushSlots(fired.includes("critical") ? "critical" : "warning", now, sla);
  return { status: "ran" as const, alerts };
}

export async function loadSpeedPage(now = new Date()) {
  const sla = await loadSla();
  const { start } = zonedDayBounds(now, sla.timeZone);
  const rows = await prisma.leadResponse.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      OR: [{ firstTouchAt: null }, { slaStartAt: { gte: start } }, { firstTouchAt: { gte: start } }],
    },
    include: { alerts: true },
    orderBy: { slaStartAt: "asc" },
  });
  return planSpeedToLead(rows.map(toSpeedLead), sla, now).summary;
}

export async function loadSpeedLead(id: string, now = new Date()) {
  const row = await prisma.leadResponse.findFirst({ where: { id, workspaceId: WORKSPACE_ID }, include: { alerts: true } });
  if (!row) return null;
  const sla = await loadSla();
  return { view: describeLead(toSpeedLead(row), sla, now).view, targetSeconds: sla.targetSeconds };
}

export async function speedDigestItems(since: Date): Promise<{ alerts: DigestItem[]; recommendations: DigestItem[] }> {
  if (!speedToLeadEnabled()) return { alerts: [], recommendations: [] };
  const [alerts, recommendations] = await Promise.all([
    prisma.leadAlert.findMany({ where: { workspaceId: WORKSPACE_ID, detectedAt: { gte: since } } }),
    prisma.recommendation.findMany({ where: { workspaceId: WORKSPACE_ID, type: "speed_to_lead", status: "verified", verifiedAt: { gte: since } } }),
  ]);
  return {
    alerts: alerts.map((alert) => ({ id: alert.id, title: alert.title, summary: alert.summary, accountId: "", workspace: true })),
    recommendations: recommendations.map((rec) => ({ id: rec.id, title: rec.title, summary: rec.summary, accountId: "", workspace: true })),
  };
}

import { prisma } from "../db";
import type { MarketingAccess } from "./access";
import { holdoutListWhere } from "./feature-access";
import {
  assignHoldoutUnits,
  buildHoldoutDesign,
  canUndoHoldoutStart,
  computeLift,
  presentLift,
  type HoldoutDesignInput,
  type LiftObservationInput,
} from "./holdouts";
import { isolatedWhere } from "./workspace";

function day(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

function dec(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listCampaignChoices(workspaceId: string) {
  return prisma.campaign.findMany({
    where: isolatedWhere(workspaceId),
    select: { id: true, name: true, adAccountId: true },
    orderBy: { name: "asc" },
  });
}

export async function createHoldoutTest(workspaceId: string, userId: string, input: HoldoutDesignInput & { campaignId: string; adAccountId: string }) {
  const built = buildHoldoutDesign(input);
  if (!built.ok) return built;
  const campaign = await prisma.campaign.findFirst({
    where: isolatedWhere(workspaceId, { id: input.campaignId, adAccountId: input.adAccountId }),
    select: { id: true, adAccountId: true },
  });
  if (!campaign) return { ok: false as const, error: "That campaign is not in this workspace." };
  const design = built.design;
  const created = await prisma.$transaction(async (tx) => {
    const test = await tx.liftTest.create({
      data: {
        workspaceId: isolatedWhere(workspaceId).workspaceId,
        adAccountId: campaign.adAccountId,
        campaignId: campaign.id,
        name: design.name,
        question: design.question,
        designKind: design.kind,
        metric: design.metric,
        holdoutPercent: design.holdoutPercent,
        startDate: day(design.startDate),
        endDate: day(design.endDate),
        preStartDate: design.preStartDate ? day(design.preStartDate) : null,
        minSample: design.minSample,
        status: "draft",
        createdById: userId,
      },
    });
    const assignments = assignHoldoutUnits({
      testKey: test.id,
      units: design.units,
      holdoutPercent: design.holdoutPercent,
      kind: design.kind,
      holdoutUnits: design.holdoutUnits,
    });
    await tx.liftAssignment.createMany({
      data: assignments.map((assignment) => ({
        workspaceId: isolatedWhere(workspaceId).workspaceId,
        testId: test.id,
        unitKey: assignment.unitKey,
        role: assignment.role,
      })),
    });
    return test;
  });
  return { ok: true as const, test: created };
}

export async function listHoldoutTests(access: MarketingAccess) {
  const where = holdoutListWhere(access);
  if (where.workspaceId !== isolatedWhere(access.workspaceId).workspaceId) throw new Error("workspace mismatch");
  return prisma.liftTest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { name: true } },
      assignments: { orderBy: { unitKey: "asc" } },
      results: { orderBy: { computedAt: "desc" }, take: 1 },
    },
  });
}

export async function startHoldoutTest(workspaceId: string, userId: string, testId: string, now = new Date()) {
  const updated = await prisma.liftTest.updateMany({
    where: isolatedWhere(workspaceId, { id: testId, status: "draft" }),
    data: { status: "running", startedById: userId, startedAt: now, invalidatedReason: "" },
  });
  return updated.count;
}

export async function undoHoldoutStart(workspaceId: string, testId: string, now = new Date()) {
  const test = await prisma.liftTest.findFirst({ where: isolatedWhere(workspaceId, { id: testId }) });
  if (!test || !canUndoHoldoutStart(test.status, test.startedAt, now)) return 0;
  const updated = await prisma.liftTest.updateMany({
    where: isolatedWhere(workspaceId, { id: testId, status: "running" }),
    data: { status: "draft", startedById: null, startedAt: null },
  });
  return updated.count;
}

export async function recordLiftObservation(
  workspaceId: string,
  testId: string,
  observation: LiftObservationInput,
  seesCost: boolean,
) {
  const test = await prisma.liftTest.findFirst({
    where: isolatedWhere(workspaceId, { id: testId }),
    include: { assignments: true },
  });
  if (!test) return { ok: false as const, message: "That test is not in this workspace." };
  if (!test.assignments.some((assignment) => assignment.unitKey === observation.unitKey)) {
    return { ok: false as const, message: "That area is not part of this test." };
  }
  const spend = seesCost ? Math.max(0, observation.spend ?? 0) : 0;
  await prisma.liftObservation.upsert({
    where: {
      liftObservationUnit: {
        workspaceId: isolatedWhere(workspaceId).workspaceId,
        testId,
        unitKey: observation.unitKey,
        period: observation.period,
      },
    },
    create: {
      workspaceId: isolatedWhere(workspaceId).workspaceId,
      testId,
      unitKey: observation.unitKey,
      period: observation.period,
      outcome: observation.outcome.toFixed(4),
      spend: spend.toFixed(4),
      impressions: Math.max(0, Math.round(observation.impressions ?? 0)),
    },
    update: {
      outcome: observation.outcome.toFixed(4),
      spend: spend.toFixed(4),
      impressions: Math.max(0, Math.round(observation.impressions ?? 0)),
    },
  });
  return { ok: true as const };
}

export async function computeHoldoutReadout(workspaceId: string, testId: string, seesCost: boolean, now = new Date()) {
  const test = await prisma.liftTest.findFirst({
    where: isolatedWhere(workspaceId, { id: testId }),
    include: { assignments: true, observations: true },
  });
  if (!test) return null;
  const math = computeLift({
    metric: test.metric,
    minSample: test.minSample,
    assignments: test.assignments.map((assignment) => ({ unitKey: assignment.unitKey, role: assignment.role })),
    observations: test.observations.map((observation) => ({
      unitKey: observation.unitKey,
      period: observation.period,
      outcome: dec(observation.outcome),
      spend: dec(observation.spend),
      impressions: observation.impressions,
    })),
  });
  await prisma.liftResult.create({
    data: {
      workspaceId: isolatedWhere(workspaceId).workspaceId,
      testId: test.id,
      computedAt: now,
      ready: math.ready,
      verdict: math.verdict,
      method: math.method || "",
      extraLeads: math.extra === null ? null : math.extra.toFixed(4),
      rangeLow: math.rangeLow === null ? null : math.rangeLow.toFixed(4),
      rangeHigh: math.rangeHigh === null ? null : math.rangeHigh.toFixed(4),
      confidence: math.confidence === null ? null : math.confidence.toFixed(4),
      extraLeadCost: math.extraLeadCost === null ? null : math.extraLeadCost.toFixed(4),
      sentence: math.sentence,
      treatmentOutcome: math.treatmentOutcome.toFixed(4),
      holdoutOutcome: math.holdoutOutcome.toFixed(4),
    },
  });
  if (math.verdict === "invalidated") {
    await prisma.liftTest.updateMany({
      where: isolatedWhere(workspaceId, { id: test.id }),
      data: { status: "invalidated", invalidatedReason: math.sentence },
    });
  }
  return presentLift(math, seesCost);
}

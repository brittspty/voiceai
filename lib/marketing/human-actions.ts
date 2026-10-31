"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { audit } from "../audit";
import { requireStaffUser } from "../auth";
import { denyAccess } from "../deny";
import { prisma } from "../db";
import { setCampaignBudget } from "./budget";
import { prismaBudgetStore } from "./budget-store";
import { passwordIssues } from "./access";
import { clientViewersEnabled } from "./config";
import { loadMarketingAccess } from "./queries";
import { decideRecommendation } from "./recommendations";
import { assertCanCreateShareLink, defaultShareExpiry, hashPasscode, newShareToken } from "./share-link";
import { OFFERED_SKILL, skillIsSafe } from "./skills";
import { WORKSPACE_ID } from "./types";

export async function saveCampaignBudget(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!access.canEditBudget) denyAccess();
  await setCampaignBudget(
    { kind: "human", access },
    {
      campaignId: String(formData.get("campaignId") || ""),
      adAccountId: String(formData.get("adAccountId") || ""),
      amount: String(formData.get("amount") || ""),
      period: String(formData.get("period") || "daily") === "lifetime" ? "lifetime" : "daily",
      currency: String(formData.get("currency") || "USD"),
      source: "human_edit",
    },
    prismaBudgetStore(),
  );
  revalidatePath("/marketing");
}

export async function decideMarketingRecommendation(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "dismiss");
  const rec = await prisma.recommendation.findUnique({ where: { id } });
  if (!rec) throw new Error("That suggestion was not found.");
  if (access.kind === "client_viewer" || access.kind === "none" || (!access.seesAlerts && access.kind !== "account_manager")) {
    denyAccess();
  }
  if (rec.type === "pacing" && (!access.seesCost || (access.kind !== "super_admin" && access.kind !== "account_manager"))) {
    denyAccess();
  }
  const draftId = draftVersionId(rec.evidence);
  if (decision === "later") {
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { decisionNote: "later", decidedById: user.id, decidedAt: new Date() },
    });
    revalidatePath("/marketing");
    return;
  }
  if (decision === "undo") {
    const decidedAt = rec.decidedAt?.getTime() ?? 0;
    if (Date.now() - decidedAt > 30_000) throw new Error("The undo window has closed.");
    if (rec.type === "creative_fatigue") await setDraftStatus(draftId, "draft");
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "verified", decisionNote: "", decidedById: null, decidedAt: null },
    });
    revalidatePath("/marketing");
    return;
  }
  if (decision === "assign") {
    if (rec.type !== "budget_change" && rec.type !== "pacing") throw new Error("Only a budget handoff can be assigned.");
    await audit(user, "Assigned a budget change to a teammate", { type: "recommendation", id: rec.id, label: rec.title });
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { decisionNote: "assigned", decidedById: user.id },
    });
    revalidatePath("/marketing");
    return;
  }
  if (decision === "confirm") {
    if (rec.type !== "budget_change" && rec.type !== "pacing") throw new Error("Only a budget handoff can be confirmed.");
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { decisionNote: "done", decidedById: user.id },
    });
    revalidatePath("/marketing");
    return;
  }
  const choice = decision === "accept" || decision === "decline" ? decision : "dismiss";
  const reason = String(formData.get("reason") || "");
  const result = await decideRecommendation({
    actor: { kind: "human", access },
    recommendation: {
      id: rec.id,
      type: rec.type,
      status: rec.status,
      campaignId: rec.campaignId,
      adAccountId: rec.adAccountId,
      proposedBudgetAmount: rec.proposedBudgetAmount ? rec.proposedBudgetAmount.toString() : null,
      proposedBudgetPeriod: rec.proposedBudgetPeriod === "daily" || rec.proposedBudgetPeriod === "lifetime" ? rec.proposedBudgetPeriod : null,
      proposedCurrency: rec.proposedCurrency,
    },
    decision: choice,
    budgetStore: prismaBudgetStore(),
  });
  if (result.status === "accepted" && rec.type === "creative_fatigue") await setDraftStatus(draftId, "queued");
  const decisionNote =
    (rec.type === "budget_change" || rec.type === "pacing") && choice === "accept"
      ? "waiting"
      : rec.type === "creative_fatigue" && choice === "accept"
        ? "queued"
        : rec.type === "ad_fatigue" || rec.type === "stackadapt" || rec.type === "business_profile"
          ? choice === "accept"
            ? "yes"
            : choice === "decline"
              ? "no"
              : choice
          : reason || choice;
  await prisma.recommendation.update({
    where: { id: rec.id },
    data: {
      status: result.status,
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote,
    },
  });
  revalidatePath("/marketing");
}

function draftVersionId(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "";
  const id = (evidence as { draftCreativeVersionId?: unknown }).draftCreativeVersionId;
  return typeof id === "string" ? id : "";
}

async function setDraftStatus(id: string, status: "draft" | "queued") {
  if (!id) return;
  const row = await prisma.creativeVersion.findUnique({ where: { id }, select: { id: true } });
  if (!row) return;
  await prisma.creativeVersion.update({ where: { id }, data: { status } });
}

export async function decideSkillOffer(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") denyAccess();
  if (!skillIsSafe(OFFERED_SKILL)) throw new Error("This skill cannot be added.");
  const choice = String(formData.get("choice") || "no");
  await audit(user, choice === "yes" ? "Added a skill" : "Skipped a skill", { type: "skill", label: OFFERED_SKILL.name });
  revalidatePath("/marketing/skills");
}

export async function createShareLink(input: { label?: string; expiresAt?: string | null; passcode?: string | null }) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  assertCanCreateShareLink(access, WORKSPACE_ID);
  const minted = newShareToken();
  const chosen = input.expiresAt ? new Date(input.expiresAt) : defaultShareExpiry();
  const expiresAt = Number.isNaN(chosen.getTime()) ? defaultShareExpiry() : chosen;
  const passcode = (input.passcode || "").trim();
  await prisma.clientShareLink.create({
    data: {
      workspaceId: WORKSPACE_ID,
      tokenHash: minted.tokenHash,
      label: (input.label || "").slice(0, 120),
      createdById: user.id,
      expiresAt,
      passcodeHash: passcode ? hashPasscode(passcode) : null,
    },
  });
  revalidatePath("/marketing");
  return { token: minted.token };
}

export async function createClientViewer(input: { name: string; email: string; password: string }) {
  const user = await requireStaffUser();
  if (!clientViewersEnabled()) throw new Error("Client viewer invites are turned off.");
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") denyAccess();
  const issues = passwordIssues(input.password, input.email);
  if (issues.length) throw new Error(issues[0]);
  const created = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 10),
      role: "client_viewer",
    },
  });
  await prisma.clientViewerAccess.create({ data: { userId: created.id, workspaceId: WORKSPACE_ID } });
  revalidatePath("/marketing");
  return { id: created.id, email: created.email };
}

export async function revokeShareLink(id: string) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  assertCanCreateShareLink(access, WORKSPACE_ID);
  await prisma.clientShareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/marketing");
}

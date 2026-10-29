"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { prisma } from "../db";
import { setCampaignBudget } from "./budget";
import { prismaBudgetStore } from "./budget-store";
import { loadMarketingAccess } from "./queries";
import { decideRecommendation } from "./recommendations";
import { assertCanCreateShareLink, newShareToken } from "./share-link";
import { WORKSPACE_ID } from "./types";

export async function saveCampaignBudget(formData: FormData) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
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
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "dismiss");
  const rec = await prisma.recommendation.findUnique({ where: { id } });
  if (!rec) throw new Error("That suggestion was not found.");
  const choice = decision === "accept" || decision === "decline" ? decision : "dismiss";
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
  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: result.status, decidedById: user.id, decidedAt: new Date(), decisionNote: choice },
  });
  revalidatePath("/marketing");
}

export async function createShareLink(input: { label?: string; expiresAt?: string | null }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  assertCanCreateShareLink(access, WORKSPACE_ID);
  const minted = newShareToken();
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  await prisma.clientShareLink.create({
    data: {
      workspaceId: WORKSPACE_ID,
      tokenHash: minted.tokenHash,
      label: (input.label || "").slice(0, 120),
      createdById: user.id,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    },
  });
  revalidatePath("/marketing");
  return { token: minted.token };
}

export async function createClientViewer(input: { name: string; email: string; password: string }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") {
    throw new Error("You can't add a client viewer.");
  }
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
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  assertCanCreateShareLink(access, WORKSPACE_ID);
  await prisma.clientShareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/marketing");
}

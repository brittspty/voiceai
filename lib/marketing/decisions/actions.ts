"use server";

import { revalidatePath } from "next/cache";
import { audit } from "../../audit";
import { requireUser } from "../../auth";
import { denyAccess } from "../../deny";
import { prisma } from "../../db";
import { zonedISODate } from "../../time";
import { canApproveMarketing } from "../access";
import { decisionsV1Enabled } from "../config";
import { loadMarketingAccess } from "../queries";
import { WORKSPACE_ID } from "../types";
import { decisionsRequestStatus } from "./access";
import { planDecision } from "./workflow";

/** Records approve, dismiss, or snooze. Nothing is sent to an ad platform and no budget is written. */
export async function recordDecisionAction(formData: FormData) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const status = decisionsRequestStatus({
    surface: "page",
    enabled: decisionsV1Enabled(),
    signedIn: true,
    kind: access.kind,
  });
  if (status !== 200 || !canApproveMarketing(access)) denyAccess();
  const id = String(formData.get("id") || "");
  const action = String(formData.get("action") || "");
  if (action !== "approve" && action !== "dismiss" && action !== "snooze") {
    throw new Error("Choose approve, dismiss, or snooze.");
  }
  const row = await prisma.recommendation.findFirst({ where: { id, workspaceId: WORKSPACE_ID, archivedAt: null } });
  if (!row) throw new Error("That decision was not found.");
  if (row.status !== "draft" && row.status !== "verified") throw new Error("This decision is already closed.");
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
  const now = new Date();
  const planned = planDecision({
    recommendationId: row.id,
    action,
    reason: String(formData.get("reason") || ""),
    note: String(formData.get("note") || ""),
    snoozeUntil: String(formData.get("snoozeUntil") || ""),
    today: zonedISODate(now, org?.timezone || "America/New_York"),
    userId: user.id,
    at: now.toISOString(),
    rule: row.rule || row.type,
    evidence: row.evidence,
  });
  if (!planned.ok) throw new Error(planned.error);
  if (planned.executes || planned.platformWrite || planned.budgetWrite !== "none" || planned.writesAds || planned.changesSpend) {
    throw new Error("This decision cannot change a campaign.");
  }
  await prisma.decisionAudit.create({
    data: {
      workspaceId: WORKSPACE_ID,
      recommendationId: row.id,
      action: planned.audit.action,
      reason: planned.audit.reason,
      note: planned.audit.note,
      snoozeUntil: planned.audit.snoozeUntil ? new Date(`${planned.audit.snoozeUntil}T00:00:00.000Z`) : null,
      userId: planned.audit.userId,
    },
  });
  await prisma.recommendation.update({
    where: { id: row.id },
    data: {
      status: planned.status,
      snoozedUntil: planned.snoozedUntil ? new Date(`${planned.snoozedUntil}T00:00:00.000Z`) : null,
      decisionNote: planned.decisionNote,
      decidedById: action === "snooze" ? null : user.id,
      decidedAt: action === "snooze" ? null : now,
    },
  });
  await audit(user, action === "approve" ? "Approved a decision" : action === "dismiss" ? "Dismissed a decision" : "Snoozed a decision", {
    type: "recommendation",
    id: row.id,
    label: row.title,
  });
  revalidatePath("/decisions");
  revalidatePath(`/decisions/${row.id}`);
}

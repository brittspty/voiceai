"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { prisma } from "../db";
import { dashboardsV2Enabled } from "./config";
import { loadMarketingAccess } from "./queries";
import { canEditLeadValue, parseLeadDollars, saveClientLeadValue, type LeadValueStore } from "./lead-value";

function store(): LeadValueStore {
  return {
    async read(workspaceId) {
      const row = await prisma.clientSettings.findUnique({
        where: { workspaceId },
        select: { leadValueCents: true, callValueCents: true },
      });
      return row;
    },
    async write(workspaceId, row) {
      await prisma.clientSettings.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          leadValueCents: row.leadValueCents,
          callValueCents: row.callValueCents,
          leadValueSetById: row.userId,
          leadValueSetAt: row.setAt,
        },
        update: {
          leadValueCents: row.leadValueCents,
          callValueCents: row.callValueCents,
          leadValueSetById: row.userId,
          leadValueSetAt: row.setAt,
        },
      });
    },
    async audit(row) {
      await prisma.leadValueAudit.create({
        data: {
          workspaceId: row.workspaceId,
          oldLeadCents: row.oldLeadCents,
          newLeadCents: row.newLeadCents,
          oldCallCents: row.oldCallCents,
          newCallCents: row.newCallCents,
          userId: row.userId,
          setAt: row.setAt,
        },
      });
    },
  };
}

/** Saves a per-workspace lead value. Does not write a budget or call an ad platform. */
export async function saveLeadValueAction(formData: FormData): Promise<{ error?: string; ok?: true }> {
  if (!dashboardsV2Enabled()) return { error: "Campaign dashboards are turned off." };
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canEditLeadValue(access) || !access.workspaceId) return { error: "Only a super admin or account manager can set lead value." };
  const parsed = parseLeadDollars(String(formData.get("lead") ?? ""), String(formData.get("call") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  await saveClientLeadValue(access, { leadCents: parsed.leadCents, callCents: parsed.callCents }, store());
  revalidatePath("/marketing");
  revalidatePath("/marketing/onboarding");
  revalidatePath("/marketing/client");
  return { ok: true };
}

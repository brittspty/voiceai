"use server";

import { revalidatePath } from "next/cache";
import { audit } from "../audit";
import { requireStaffUser } from "../auth";
import { denyAccess } from "../deny";
import { prisma } from "../db";
import { loadMarketingAccess } from "./queries";
import { assignRolePlan } from "./roles";
import { roleAdminEnabled } from "./config";

export async function assignUserRole(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  const users = await prisma.user.findMany({ select: { id: true, role: true, name: true, email: true } });
  const plan = assignRolePlan({
    actorKind: access.kind,
    enabled: roleAdminEnabled(),
    users,
    targetId: String(formData.get("userId") || ""),
    nextRole: String(formData.get("role") || ""),
  });
  if (!plan.ok) {
    if (access.kind !== "super_admin") denyAccess();
    throw new Error(plan.reason);
  }
  const target = users.find((row) => row.id === plan.userId);
  await prisma.user.update({ where: { id: plan.userId }, data: { role: plan.role } });
  await audit(user, "Assigned a role", { type: "user", id: plan.userId, label: `${target?.email || plan.userId} → ${plan.role}` });
  revalidatePath("/settings/roles");
}

"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { audit } from "./audit";
import { requireUser } from "./auth";
import { denyAccess } from "./deny";
import { prisma } from "./db";
import { userAdminEnabled } from "./marketing/config";
import { loadMarketingAccess } from "./marketing/queries";
import { planAssignManager, planCreateViewer, planDeleteUser, planSetDisabled, type UserAdminTarget } from "./user-admin";

async function actorContext() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const assignments = await prisma.marketingAssignment.findMany({
    where: { userId: user.id, scopeKind: "client" },
    select: { workspaceId: true },
  });
  return { user, access, workspaces: [...new Set(assignments.map((row) => row.workspaceId))] };
}

async function targetOf(id: string): Promise<UserAdminTarget | null> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, disabledAt: true, clientAccess: { select: { workspaceId: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    disabledAt: row.disabledAt,
    workspaceId: row.clientAccess?.workspaceId ?? null,
  };
}

async function signingSuperAdmins(exceptId: string) {
  return prisma.user.count({ where: { role: "super_admin", disabledAt: null, id: { not: exceptId } } });
}

function fail(accessKind: string, reason: string): never {
  if (reason === "User admin is turned off." || reason.startsWith("Only a super admin") || reason.startsWith("You cannot") || reason.startsWith("An account manager") || reason.startsWith("You can only")) {
    denyAccess();
  }
  if (accessKind !== "super_admin" && accessKind !== "account_manager") denyAccess();
  throw new Error(reason);
}

export async function assignAccountManager(formData: FormData) {
  const { user, access } = await actorContext();
  const managerId = String(formData.get("managerId") || "");
  const manager = managerId
    ? await prisma.user.findUnique({ where: { id: managerId }, select: { id: true, role: true, email: true } })
    : null;
  const plan = planAssignManager({
    enabled: userAdminEnabled(),
    actorKind: access.kind,
    manager,
    workspaceId: String(formData.get("workspaceId") || ""),
  });
  if (!plan.ok) fail(access.kind, plan.reason);
  const existing = await prisma.marketingAssignment.findFirst({
    where: { userId: plan.userId, workspaceId: plan.workspaceId, scopeKind: "client" },
    select: { id: true },
  });
  if (!existing) {
    await prisma.marketingAssignment.create({
      data: { userId: plan.userId, workspaceId: plan.workspaceId, scopeKind: "client" },
    });
  }
  await audit(user, "Assigned an account manager", { type: "user", id: plan.userId, label: `${manager?.email || plan.userId} → ${plan.workspaceId}` });
  revalidatePath("/settings/people");
}

export async function createClientViewerLogin(formData: FormData) {
  const { user, access, workspaces } = await actorContext();
  const plan = planCreateViewer({
    enabled: userAdminEnabled(),
    actorKind: access.kind,
    actorWorkspaces: workspaces,
    name: String(formData.get("name") || ""),
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
    workspaceId: String(formData.get("workspaceId") || ""),
  });
  if (!plan.ok) fail(access.kind, plan.reason);
  if (await prisma.user.findUnique({ where: { email: plan.email }, select: { id: true } })) {
    throw new Error("That person already has an account.");
  }
  const created = await prisma.user.create({
    data: {
      name: plan.name,
      email: plan.email,
      passwordHash: await bcrypt.hash(plan.password, 10),
      role: plan.role,
      clientAccess: { create: { workspaceId: plan.workspaceId } },
    },
  });
  await audit(user, "Created a client viewer", { type: "user", id: created.id, label: `${plan.email} → ${plan.workspaceId}` });
  revalidatePath("/settings/people");
}

export async function setUserDisabled(formData: FormData) {
  const { user, access, workspaces } = await actorContext();
  const target = await targetOf(String(formData.get("userId") || ""));
  const disabled = String(formData.get("disabled") || "") === "1";
  const plan = planSetDisabled({
    enabled: userAdminEnabled(),
    actorKind: access.kind,
    actorId: user.id,
    actorWorkspaces: workspaces,
    target,
    disabled,
    superAdminsLeft: target ? await signingSuperAdmins(target.id) : 0,
  });
  if (!plan.ok) fail(access.kind, plan.reason);
  if (plan.disabled) {
    await prisma.user.update({ where: { id: plan.userId }, data: { disabledAt: new Date() } });
    await prisma.session.deleteMany({ where: { userId: plan.userId } });
    await audit(user, "Turned off a user", { type: "user", id: plan.userId, label: target?.email });
  } else {
    await prisma.user.update({ where: { id: plan.userId }, data: { disabledAt: null } });
    await audit(user, "Turned on a user", { type: "user", id: plan.userId, label: target?.email });
  }
  revalidatePath("/settings/people");
}

export async function deleteUserAccount(formData: FormData) {
  const { user, access } = await actorContext();
  const target = await targetOf(String(formData.get("userId") || ""));
  const plan = planDeleteUser({
    enabled: userAdminEnabled(),
    actorKind: access.kind,
    actorId: user.id,
    target,
    confirm: String(formData.get("confirm") || ""),
    superAdminsLeft: target ? await signingSuperAdmins(target.id) : 0,
  });
  if (!plan.ok) fail(access.kind, plan.reason);
  await audit(user, "Deleted a user", { type: "user", id: plan.userId, label: target?.email });
  try {
    await prisma.user.delete({ where: { id: plan.userId } });
  } catch {
    throw new Error("This person still has records. Turn the account off instead.");
  }
  revalidatePath("/settings/people");
}

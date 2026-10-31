"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { denyAccess } from "../deny";
import { prisma } from "../db";
import { appUrl } from "../env";
import { audit } from "../audit";
import { createDemoLinkToken, hashToken, newGrantId, DEMO_ROLE } from "./access";
import { applyDemoDataset } from "./seed-apply";
import { demoAccessSecret, demoWorkspaceEnabled } from "./flags";

function canOperate(role: string) {
  return role === "super_admin" || role === "owner";
}

export async function resetDemo() {
  if (!demoWorkspaceEnabled()) denyAccess();
  const user = await requireUser();
  if (!canOperate(user.role)) denyAccess();
  const result = await applyDemoDataset(prisma);
  await audit(user, "Reset demo", { type: "workspace", id: result.workspaceId, label: "Demo workspace" });
  revalidatePath("/demo");
  revalidatePath("/settings/demo");
}

export async function mintDemoLink(form: FormData) {
  if (!demoWorkspaceEnabled()) denyAccess();
  const user = await requireUser();
  if (!canOperate(user.role)) denyAccess();
  const secret = demoAccessSecret();
  const days = Math.min(90, Math.max(1, Math.floor(Number(form.get("days") || 14))));
  const id = newGrantId();
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  const token = createDemoLinkToken(id, exp, secret);
  await prisma.demoGrant.create({
    data: { id, tokenHash: hashToken(token), label: String(form.get("label") || "Prospect link"), expiresAt: new Date(exp * 1000) },
  });
  await audit(user, "Minted demo link", { type: "demo_grant", id, label: "Demo link" });
  const link = `${appUrl()}/demo/enter?token=${encodeURIComponent(token)}`;
  redirect(`/settings/demo?link=${encodeURIComponent(link)}`);
}

export async function ensureDemoVisitor() {
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  const email = "demo-visitor@example.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== DEMO_ROLE) await prisma.user.update({ where: { id: existing.id }, data: { role: DEMO_ROLE } });
    return existing.id;
  }
  const created = await prisma.user.create({
    data: { name: "Demo visitor", email, passwordHash, role: DEMO_ROLE },
  });
  return created.id;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { denyAccess } from "../deny";
import { prisma } from "../db";
import { clientPlansEnabled } from "./flags";
import { sanitizeLogo } from "./logo";
import {
  approvePlan,
  blankPlan,
  canEditPlans,
  cleanChannels,
  createPlanToken,
  lines,
  planLinkDays,
  revokePlan,
  sendToPreview,
  slugify,
  validCtaHref,
} from "./plan";
import { planRecord } from "./store";

async function editor() {
  if (!clientPlansEnabled()) denyAccess();
  const user = await requireUser();
  if (!canEditPlans(user.role)) denyAccess();
  return user;
}

function text(form: FormData, key: string) {
  return String(form.get(key) || "");
}

async function logoFrom(form: FormData) {
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const clean = sanitizeLogo(bytes, file.type || "");
  if (!clean.ok) throw new Error(clean.error);
  return { mime: clean.mime, data: Buffer.from(clean.bytes) };
}

function fields(form: FormData) {
  const clientName = text(form, "clientName").trim();
  if (!clientName) throw new Error("Client name is required");
  const ctaHref = text(form, "ctaHref").trim() || "/contact";
  if (!validCtaHref(ctaHref)) throw new Error("The start link must be the contact form, a mailto, or an https link");
  const source = text(form, "dashboardSource") === "baseline" ? "baseline" : "demo";
  const baselineWorkspaceId = text(form, "baselineWorkspaceId").trim();
  if (source === "baseline" && !baselineWorkspaceId) throw new Error("Choose that client's workspace");
  if (source === "baseline" && baselineWorkspaceId === "demo") throw new Error("baseline cannot be the demo workspace");
  return {
    clientName,
    slug: slugify(clientName),
    goals: text(form, "goals").trim(),
    channels: cleanChannels(form.getAll("channels").map(String)),
    audiences: lines(text(form, "audiences")),
    segments: lines(text(form, "segments")),
    dashboardSource: source as "demo" | "baseline",
    baselineWorkspaceId: source === "baseline" ? baselineWorkspaceId : "",
    timeline: text(form, "timeline").trim(),
    weekly: text(form, "weekly").trim(),
    ctaLabel: text(form, "ctaLabel").trim() || "Let's start",
    ctaHref,
    showCost: form.get("showCost") === "on",
    linkDays: planLinkDays(process.env, Number(text(form, "linkDays") || planLinkDays())),
  };
}

export async function createPlan(form: FormData) {
  const user = await editor();
  const name = text(form, "clientName").trim();
  if (!name) throw new Error("Client name is required");
  const draft = blankPlan("new", name, planLinkDays());
  const row = await prisma.clientPlan.create({
    data: {
      slug: draft.slug,
      clientName: draft.clientName,
      ctaLabel: draft.ctaLabel,
      ctaHref: draft.ctaHref,
      linkDays: draft.linkDays,
      createdById: user.id,
    },
  });
  revalidatePath("/plans");
  redirect(`/plans/${row.id}`);
}

export async function savePlan(form: FormData) {
  await editor();
  const id = text(form, "id");
  const existing = await prisma.clientPlan.findUnique({ where: { id } });
  if (!existing) denyAccess();
  const next = fields(form);
  const logo = await logoFrom(form);
  await prisma.clientPlan.update({
    where: { id },
    data: {
      ...next,
      ...(logo ? { logoMime: logo.mime, logoData: logo.data } : {}),
    },
  });
  revalidatePath(`/plans/${id}`);
  redirect(`/plans/${id}`);
}

export async function previewPlan(form: FormData) {
  await editor();
  const id = text(form, "id");
  const existing = await prisma.clientPlan.findUnique({ where: { id } });
  if (!existing) denyAccess();
  const next = sendToPreview(planRecord(existing));
  await prisma.clientPlan.update({ where: { id }, data: { status: next.status } });
  revalidatePath(`/plans/${id}`);
  redirect(`/plans/${id}/preview`);
}

export async function approvePlanAction(form: FormData) {
  const user = await editor();
  const id = text(form, "id");
  const existing = await prisma.clientPlan.findUnique({ where: { id } });
  if (!existing) denyAccess();
  const issued = createPlanToken();
  const next = approvePlan(planRecord(existing), user.id, new Date(), issued, existing.linkDays);
  await prisma.clientPlan.update({
    where: { id },
    data: {
      status: next.plan.status,
      approvedById: next.plan.approvedById,
      approvedAt: next.plan.approvedAt ? new Date(next.plan.approvedAt) : null,
      tokenHash: next.plan.tokenHash,
      expiresAt: next.plan.expiresAt ? new Date(next.plan.expiresAt) : null,
      revokedAt: null,
    },
  });
  revalidatePath(`/plans/${id}`);
  redirect(`/plans/${id}?issued=${encodeURIComponent(next.token)}`);
}

export async function revokePlanAction(form: FormData) {
  await editor();
  const id = text(form, "id");
  const existing = await prisma.clientPlan.findUnique({ where: { id } });
  if (!existing) denyAccess();
  const next = revokePlan(planRecord(existing), new Date());
  await prisma.clientPlan.update({ where: { id }, data: { revokedAt: next.revokedAt ? new Date(next.revokedAt) : null } });
  revalidatePath(`/plans/${id}`);
  redirect(`/plans/${id}`);
}

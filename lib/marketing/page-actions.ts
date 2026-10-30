"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { denyAccess } from "../deny";
import { prisma } from "../db";
import { loadMarketingAccess } from "./queries";
import { isRealClientKey, MUTE_MS } from "./pages/policy";
import { canonicalPageUrl, formTargetIssue, publicUrlIssue } from "./pages/probe";
import { resumeLandingAds } from "./pages/store";
import { customerIdIssue, secretRefIssue } from "./pages/writes";
import { WORKSPACE_ID } from "./types";

async function manager() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") denyAccess();
  return { user, access };
}

async function superAdmin() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") denyAccess();
  return user;
}

function refresh() {
  revalidatePath("/sites/landing-pages");
}

export async function addLandingPage(input: { name: string; url: string; clientKey: string; formTestUrl?: string; expectForm?: boolean }) {
  await manager();
  if (!isRealClientKey(input.clientKey)) return { ok: false as const, message: "Choose a client." };
  const client = await prisma.marketingClient.findFirst({ where: { id: input.clientKey, workspaceId: WORKSPACE_ID } });
  if (!client) return { ok: false as const, message: "Choose a client." };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) return { ok: false as const, message: "Enter a page name." };
  const urlIssue = publicUrlIssue(input.url);
  if (urlIssue) return { ok: false as const, message: urlIssue };
  const url = canonicalPageUrl(input.url);
  if (!url) return { ok: false as const, message: "Enter a page address." };
  const formTestUrl = (input.formTestUrl || "").trim();
  if (formTestUrl) {
    const formIssue = formTargetIssue(url, formTestUrl);
    if (formIssue) return { ok: false as const, message: formIssue };
  }
  try {
    await prisma.landingPage.create({
      data: {
        workspaceId: WORKSPACE_ID,
        clientKey: client.id,
        clientLabel: client.name,
        name,
        url,
        formTestUrl,
        expectForm: input.expectForm !== false,
      },
    });
  } catch {
    return { ok: false as const, message: "That page is already being watched." };
  }
  refresh();
  return { ok: true as const, message: "Page added. The first check runs within 5 minutes." };
}

export async function createMarketingClient(name: string) {
  await superAdmin();
  const label = name.trim().replace(/\s+/g, " ");
  if (!label || label.length > 80) return { ok: false as const, message: "Enter a client name." };
  if (label.toLowerCase() === "org") return { ok: false as const, message: "Choose a client name." };
  try {
    await prisma.marketingClient.create({ data: { workspaceId: WORKSPACE_ID, name: label } });
  } catch {
    return { ok: false as const, message: "That client already exists." };
  }
  refresh();
  return { ok: true as const, message: "Client added." };
}

export async function assignAccountToClient(input: { accountId: string; clientKey: string }) {
  await superAdmin();
  if (!isRealClientKey(input.clientKey)) return { ok: false as const, message: "Choose a client." };
  const client = await prisma.marketingClient.findFirst({ where: { id: input.clientKey, workspaceId: WORKSPACE_ID } });
  if (!client) return { ok: false as const, message: "Choose a client." };
  const updated = await prisma.adAccount.updateMany({
    where: { id: input.accountId, workspaceId: WORKSPACE_ID },
    data: { clientId: client.id },
  });
  if (!updated.count) return { ok: false as const, message: "That ad account was not found." };
  refresh();
  return { ok: true as const, message: "Ad account assigned." };
}

export async function stopWatchingPage(pageId: string) {
  await manager();
  await prisma.landingPage.updateMany({ where: { id: pageId, workspaceId: WORKSPACE_ID }, data: { active: false } });
  refresh();
  return { ok: true as const, message: "Stopped watching that page." };
}

export async function setPageMonitorOptIn(input: { clientKey: string; autoPauseOptIn: boolean; clientAlertOptIn: boolean }) {
  await superAdmin();
  if (!isRealClientKey(input.clientKey)) return { ok: false as const, message: "Choose a client." };
  const client = await prisma.marketingClient.findFirst({ where: { id: input.clientKey, workspaceId: WORKSPACE_ID } });
  if (!client) return { ok: false as const, message: "Choose a client." };
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } });
  await prisma.clientPageSetting.upsert({
    where: { workspaceId_clientKey: { workspaceId: WORKSPACE_ID, clientKey: client.id } },
    create: {
      workspaceId: WORKSPACE_ID,
      clientKey: client.id,
      clientLabel: client.name,
      autoPauseOptIn: input.autoPauseOptIn,
      clientAlertOptIn: input.clientAlertOptIn,
      timezone: org?.timezone || "America/New_York",
    },
    update: {
      autoPauseOptIn: input.autoPauseOptIn,
      clientAlertOptIn: input.clientAlertOptIn,
    },
  });
  refresh();
  return { ok: true as const, message: input.autoPauseOptIn ? `Automatic pause is on for ${client.name}.` : `Automatic pause is off for ${client.name}.` };
}

export async function muteLandingPage(pageId: string) {
  await manager();
  await prisma.landingPage.updateMany({
    where: { id: pageId, workspaceId: WORKSPACE_ID },
    data: { mutedUntil: new Date(Date.now() + MUTE_MS) },
  });
  refresh();
  return { ok: true as const, message: "Muted for 24 hours." };
}

export async function resumeLandingPage(input: { pageId?: string; trackedId?: string }) {
  const { user } = await manager();
  const result = await resumeLandingAds({ pageId: input.pageId, trackedId: input.trackedId, actorId: user.id, actorName: user.name });
  refresh();
  return result;
}

export async function savePageWriteCredential(input: {
  clientKey: string;
  platform: "meta" | "google_ads";
  secretRef: string;
  appSecretRef?: string;
  extraSecretRef?: string;
  customerId?: string;
  loginCustomerId?: string;
}) {
  await superAdmin();
  if (!isRealClientKey(input.clientKey)) return { ok: false as const, message: "Choose a client." };
  const client = await prisma.marketingClient.findFirst({ where: { id: input.clientKey, workspaceId: WORKSPACE_ID } });
  if (!client) return { ok: false as const, message: "Choose a client." };
  const secretIssue = secretRefIssue(input.secretRef);
  if (secretIssue) return { ok: false as const, message: secretIssue };
  const appSecretRef = (input.appSecretRef || "").trim();
  if (appSecretRef) {
    const appIssue = secretRefIssue(appSecretRef);
    if (appIssue) return { ok: false as const, message: appIssue };
  }
  const extraSecretRef = (input.extraSecretRef || "").trim();
  if (input.platform === "google_ads") {
    if (!extraSecretRef) return { ok: false as const, message: "Enter the developer token variable name." };
    const extraIssue = secretRefIssue(extraSecretRef);
    if (extraIssue) return { ok: false as const, message: extraIssue };
    const customerIssue = customerIdIssue(input.customerId || "");
    if (customerIssue) return { ok: false as const, message: customerIssue };
  }
  await prisma.pageWriteCredential.upsert({
    where: { workspaceId_clientKey_platform: { workspaceId: WORKSPACE_ID, clientKey: client.id, platform: input.platform } },
    create: {
      workspaceId: WORKSPACE_ID,
      clientKey: client.id,
      platform: input.platform,
      secretRef: input.secretRef.trim(),
      appSecretRef,
      extraSecretRef,
      accountExternalId: (input.customerId || "").replace(/-/g, "").trim(),
      loginCustomerId: (input.loginCustomerId || "").replace(/-/g, "").trim(),
      scopes: input.platform === "meta" ? ["ads_management"] : ["adwords"],
    },
    update: {
      secretRef: input.secretRef.trim(),
      appSecretRef,
      extraSecretRef,
      accountExternalId: (input.customerId || "").replace(/-/g, "").trim(),
      loginCustomerId: (input.loginCustomerId || "").replace(/-/g, "").trim(),
      scopes: input.platform === "meta" ? ["ads_management"] : ["adwords"],
    },
  });
  refresh();
  return { ok: true as const, message: "Saved the variable names. The token stays in the environment." };
}

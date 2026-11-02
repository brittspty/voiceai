import { prisma } from "../db";
import { appUrl } from "../env";
import { WORKSPACE_ID } from "../marketing/types";
import { consentOnboardingSelection, statusForUrl, websitesCovered, type ConsentSelection } from "./onboarding";
import type { ConsentLog } from "./public";
import { isVoiceLevel, type VoiceLevel } from "./levels";
import { requiredVoiceLevel } from "./voice-gate";
import type { StoredChoice } from "./record";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Consent rows are insert-only. This updates the wording version table, never a choice row. */
export async function saveConsentRecord(record: ConsentLog) {
  await prisma.consentWordingVersion.upsert({
    where: { id: record.wordingVersionId },
    update: {
      version: record.wordingVersionId,
      status: "draft",
      text: record.wordingText,
      textHash: record.wordingHash,
    },
    create: {
      id: record.wordingVersionId,
      version: record.wordingVersionId,
      status: "draft",
      text: record.wordingText,
      textHash: record.wordingHash,
    },
  });
  await prisma.consentRecord.create({
    data: {
      workspaceId: record.workspaceId,
      clientKey: record.clientKey,
      visitorId: record.visitorId,
      deviceId: record.deviceId,
      contactMatchKey: record.contactMatchKey,
      matchKeys: record.matchKeys,
      level: record.level,
      action: record.action,
      wordingVersionId: record.wordingVersionId,
      wordingHash: record.wordingHash,
      pageUrl: record.pageUrl,
      userAgentSummary: record.userAgentSummary,
      ipHash: record.ipHash,
      createdAt: new Date(record.createdAt),
    },
  });
}

export async function resolveConsentClient(clientKey: string) {
  const key = clientKey.trim();
  const workspace = await prisma.workspace.findUnique({ where: { id: key }, select: { id: true } });
  if (workspace) return { workspaceId: workspace.id, clientKey: workspace.id };
  const client = await prisma.marketingClient.findUnique({ where: { id: key }, select: { id: true, workspaceId: true } });
  if (client) return { workspaceId: client.workspaceId, clientKey: client.id };
  return null;
}

export async function recordConsentInstall(input: { workspaceId: string; clientKey: string; pageUrl: string; kind: "detected" | "installed" }) {
  const since = new Date(Date.now() - DAY_MS);
  const existing = await prisma.consentInstall.findFirst({
    where: {
      workspaceId: input.workspaceId,
      clientKey: input.clientKey,
      pageUrl: input.pageUrl,
      kind: input.kind,
      seenAt: { gte: since },
    },
  });
  if (existing) return existing;
  return prisma.consentInstall.create({
    data: {
      workspaceId: input.workspaceId,
      clientKey: input.clientKey,
      pageUrl: input.pageUrl,
      kind: input.kind,
    },
  });
}

export async function readVoiceConsentMinimum(workspaceId = WORKSPACE_ID) {
  const row = await prisma.clientSettings.findUnique({
    where: { workspaceId },
    select: { voiceConsentMinLevel: true },
  });
  return requiredVoiceLevel(row?.voiceConsentMinLevel);
}

export async function readVoiceConsentSetting(workspaceId = WORKSPACE_ID): Promise<VoiceLevel | "default"> {
  const row = await prisma.clientSettings.findUnique({
    where: { workspaceId },
    select: { voiceConsentMinLevel: true },
  });
  return isVoiceLevel(row?.voiceConsentMinLevel) ? row.voiceConsentMinLevel : "default";
}

export async function latestConsentForKeys(workspaceId: string, keys: string[]): Promise<StoredChoice | null> {
  if (!keys.length) return null;
  const row = await prisma.consentRecord.findFirst({
    where: { workspaceId, OR: keys.map((key) => ({ matchKeys: { has: key } })) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, level: true, action: true },
  });
  if (!row) return null;
  return { id: row.id, createdAt: row.createdAt.toISOString(), level: row.level, action: row.action };
}

async function installSignals(workspaceId: string) {
  return prisma.consentInstall.findMany({
    where: { workspaceId },
    select: { pageUrl: true, kind: true },
    orderBy: { seenAt: "desc" },
    take: 5000,
  });
}

export async function loadConsentChecklist(workspaceId = WORKSPACE_ID) {
  const [pages, signals] = await Promise.all([
    prisma.landingPage.findMany({ where: { workspaceId, active: true }, select: { url: true } }),
    installSignals(workspaceId),
  ]);
  return { required: true as const, installed: websitesCovered(pages, signals) };
}

export async function loadConsentOnboarding(workspaceId: string, origin = appUrl()): Promise<ConsentSelection> {
  const [pages, signals] = await Promise.all([
    prisma.landingPage.findMany({
      where: { workspaceId, active: true },
      select: { id: true, name: true, url: true },
      orderBy: { name: "asc" },
    }),
    installSignals(workspaceId),
  ]);
  return consentOnboardingSelection({
    enabled: true,
    clientKey: workspaceId,
    origin,
    websites: pages.map((page) => ({
      id: page.id,
      name: page.name,
      url: page.url,
      seen: statusForUrl(page.url, signals),
    })),
  });
}

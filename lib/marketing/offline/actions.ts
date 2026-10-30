"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit } from "../../audit";
import { requireUser } from "../../auth";
import { denyAccess } from "../../deny";
import { prisma } from "../../db";
import { offlineConversionsEnabled } from "../config";
import { conversionAccess } from "./access";
import { applyDecision, newTurnOnDecision, stagesReady } from "./decision";
import { cleanLabel, cleanMetaEvent, parseCustomerId, parseDatasetId, parseDollarsToCents } from "./forms";
import { DEFAULT_STAGES } from "./types";

function refresh() {
  revalidatePath("/settings/conversions");
}

async function editor() {
  const user = await requireUser();
  const access = conversionAccess(user);
  if (!access.ok || !access.edit) denyAccess();
  return user;
}

export async function saveConversionClient(formData: FormData) {
  const user = await editor();
  const name = cleanLabel(String(formData.get("name") || ""));
  const ghlLocationId = cleanLabel(String(formData.get("ghlLocationId") || ""), 80);
  const metaDatasetId = parseDatasetId(String(formData.get("metaDatasetId") || ""));
  const googleCustomerId = parseCustomerId(String(formData.get("googleCustomerId") || ""));
  if (!name || metaDatasetId === "invalid" || googleCustomerId === "invalid") return;
  await prisma.conversionClient.create({
    data: {
      name,
      ghlLocationId,
      metaDatasetId,
      googleCustomerId,
      stages: { create: DEFAULT_STAGES.map((stage) => ({ ...stage })) },
    },
  });
  await audit({ id: user.id, name: user.name }, "Added a conversion client", { type: "conversion_client", label: name });
  refresh();
}

export async function saveConversionAccounts(formData: FormData) {
  const user = await editor();
  const clientId = cleanLabel(String(formData.get("clientId") || ""), 80);
  const metaDatasetId = parseDatasetId(String(formData.get("metaDatasetId") || ""));
  const googleCustomerId = parseCustomerId(String(formData.get("googleCustomerId") || ""));
  if (!clientId || metaDatasetId === "invalid" || googleCustomerId === "invalid") return;
  const client = await prisma.conversionClient.findUnique({ where: { id: clientId } });
  if (!client) return;
  await prisma.conversionClient.update({
    where: { id: clientId },
    data: { metaDatasetId, googleCustomerId },
  });
  await audit({ id: user.id, name: user.name }, "Saved conversion ad accounts", { type: "conversion_client", id: client.id, label: client.name });
  refresh();
}

export async function saveConversionStage(formData: FormData) {
  const user = await editor();
  const id = cleanLabel(String(formData.get("stageId") || ""), 80);
  const metaEventName = cleanMetaEvent(String(formData.get("metaEventName") || ""));
  const ghlStageName = cleanLabel(String(formData.get("ghlStageName") || ""));
  const ghlStageId = cleanLabel(String(formData.get("ghlStageId") || ""), 80);
  const actionName = cleanLabel(String(formData.get("googleAction") || ""), 180);
  const actionId = cleanLabel(String(formData.get("googleActionId") || ""), 180);
  const dollars = parseDollarsToCents(String(formData.get("valueDollars") ?? ""));
  if (!id || !metaEventName || !ghlStageName || !actionName || dollars === "invalid") return;
  const googleAction = /^\d+$/.test(actionId) || /^customers\/\d+\/conversionActions\/\d+$/.test(actionId) ? actionId : actionName;
  const stage = await prisma.conversionStageMap.findUnique({ where: { id }, include: { client: true } });
  if (!stage) return;
  await prisma.conversionStageMap.update({
    where: { id },
    data: { metaEventName, ghlStageName, ghlStageId, googleAction, valueCents: dollars },
  });
  await audit({ id: user.id, name: user.name }, "Updated a conversion stage map", { type: "conversion_client", id: stage.clientId, label: stage.client.name });
  refresh();
}

export async function requestConversionTurnOn(formData: FormData) {
  const user = await editor();
  if (!offlineConversionsEnabled()) return;
  const clientId = cleanLabel(String(formData.get("clientId") || ""), 80);
  const client = await prisma.conversionClient.findUnique({ where: { id: clientId }, include: { stages: true, decisions: true } });
  if (!client || client.enabledAt) return;
  if (!stagesReady(client.stages.map((stage) => stage.kind))) return;
  const now = new Date();
  const open = client.decisions.some(
    (decision) => decision.status === "pending" || (decision.status === "accepted" && decision.undoUntil && decision.undoUntil.getTime() > now.getTime()),
  );
  if (open) return;
  const decision = newTurnOnDecision(client.id, now, randomUUID());
  await prisma.conversionDecision.create({
    data: {
      id: decision.id,
      clientId: decision.clientId,
      status: decision.status,
      expiresAt: new Date(decision.expiresAt),
    },
  });
  await audit({ id: user.id, name: user.name }, "Asked to turn on conversion feedback", { type: "conversion_client", id: client.id, label: client.name });
  refresh();
}

export async function decideConversionTurnOn(formData: FormData) {
  const user = await editor();
  if (!offlineConversionsEnabled()) return;
  const decisionId = cleanLabel(String(formData.get("decisionId") || ""), 80);
  const action = String(formData.get("decision") || "");
  if (action !== "approve" && action !== "decline" && action !== "later" && action !== "undo") return;
  const row = await prisma.conversionDecision.findUnique({ where: { id: decisionId }, include: { client: { include: { stages: true } } } });
  if (!row) return;
  if (action === "approve" && !stagesReady(row.client.stages.map((stage) => stage.kind))) return;
  const next = applyDecision(
    {
      id: row.id,
      clientId: row.clientId,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      decidedById: row.decidedById,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      undoUntil: row.undoUntil?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    },
    action,
    new Date(),
    user.id,
  );
  await prisma.conversionDecision.update({
    where: { id: row.id },
    data: {
      status: next.status,
      decidedById: next.decidedById,
      decidedAt: next.decidedAt ? new Date(next.decidedAt) : null,
      undoUntil: next.undoUntil ? new Date(next.undoUntil) : null,
    },
  });
  await audit({ id: user.id, name: user.name }, "Recorded a conversion feedback decision", { type: "conversion_client", id: row.clientId, label: row.client.name });
  refresh();
}

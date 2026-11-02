"use server";

import { revalidatePath } from "next/cache";
import { requireStaffUser } from "../auth";
import { denyAccess } from "../deny";
import { prisma } from "../db";
import { WORKSPACE_ID } from "../marketing/types";
import { isVoiceLevel } from "./levels";

function canSetVoiceLevel(role: string) {
  return role === "owner" || role === "admin" || role === "super_admin" || role === "account_manager";
}

export async function saveVoiceConsentMinimum(formData: FormData) {
  const user = await requireStaffUser();
  if (!canSetVoiceLevel(user.role)) denyAccess();
  const raw = String(formData.get("level") || "default");
  const level = isVoiceLevel(raw) ? raw : null;
  await prisma.clientSettings.upsert({
    where: { workspaceId: WORKSPACE_ID },
    update: { voiceConsentMinLevel: level },
    create: { workspaceId: WORKSPACE_ID, voiceConsentMinLevel: level },
  });
  revalidatePath("/settings/consent");
  revalidatePath("/marketing/onboarding");
}

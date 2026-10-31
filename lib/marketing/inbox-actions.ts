"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { prisma } from "../db";
import { inboxEnabled } from "./config";

export async function markNotificationRead(formData: FormData) {
  if (!inboxEnabled()) return;
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.staffNotification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/marketing/inbox");
  revalidatePath("/");
}

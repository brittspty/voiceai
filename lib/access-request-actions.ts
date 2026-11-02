"use server";

import { revalidatePath } from "next/cache";
import { accessPageLabel, canRequestPageAccess } from "./access-request";
import { requireUser } from "./auth";
import { savePageAccessRequest } from "./access-request-store";

export async function requestPageAccess(formData: FormData) {
  const user = await requireUser();
  const pageKey = String(formData.get("pageKey") || "").trim();
  const pageLabel = accessPageLabel(pageKey);
  if (!pageLabel || !canRequestPageAccess(user.role)) return;
  await savePageAccessRequest({ userId: user.id, userName: user.name, pageKey, pageLabel });
  revalidatePath("/", "layout");
}

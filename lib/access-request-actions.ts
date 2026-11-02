"use server";

import { requireUser } from "./auth";
import { savePageAccessRequest } from "./access-request-store";

export async function requestPageAccess(formData: FormData) {
  const user = await requireUser();
  const pageKey = String(formData.get("pageKey") || "page").trim().slice(0, 80) || "page";
  const pageLabel = String(formData.get("pageLabel") || "this page").trim().slice(0, 120) || "this page";
  await savePageAccessRequest({ userId: user.id, userName: user.name, pageKey, pageLabel });
}

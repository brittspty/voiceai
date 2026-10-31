"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffUser } from "../../auth";
import { denyAccess } from "../../deny";
import { audienceLibraryEnabled } from "../config";
import { canManageAudiences } from "../feature-access";
import { loadMarketingAccess } from "../queries";
import { importMaidCsv, staffCost } from "./import";
import { importOptionsFromEnv } from "./import";
import { isAudiencePlatform } from "./payloads";
import { decideAudiencePush, importMaidAudience, logPoolSync, recordPlatformMatch, requestAudiencePush } from "./store";

function fail(message: string): never {
  redirect(`/marketing/audiences?error=${encodeURIComponent(message)}`);
}

async function gate() {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!audienceLibraryEnabled() || !canManageAudiences(access)) denyAccess();
  return { user, access };
}

export async function importAudienceCsv(formData: FormData) {
  const { user, access } = await gate();
  const parsed = importMaidCsv(String(formData.get("csv") || ""), {
    name: String(formData.get("name") || ""),
    vendor: String(formData.get("vendor") || ""),
    listId: String(formData.get("listId") || ""),
    consentBasis: String(formData.get("consentBasis") || ""),
    refreshCadence: String(formData.get("refreshCadence") || ""),
    acquisitionDate: String(formData.get("acquisitionDate") || ""),
    cost: access.seesCost ? String(formData.get("cost") || "") : "",
    currency: "USD",
    source: "data_market_maid",
    tags: ["intent", "geo", "demographics", "behavior"].flatMap((dimension) => {
      const label = String(formData.get(dimension) || "").trim();
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      if (!key) return [];
      return [{ dimension: dimension as "intent" | "geo" | "demographics" | "behavior", key, label }];
    }),
  }, importOptionsFromEnv());
  if (!parsed.ok) fail(parsed.issues[0]?.message || "That file could not be imported.");
  const stored = {
    ...parsed.value,
    lineage: { ...parsed.value.lineage, cost: staffCost(access.seesCost, parsed.value.lineage.cost) },
  };
  const saved = await importMaidAudience(access.workspaceId, stored);
  if (!saved.ok) fail(saved.message);
  void user;
  revalidatePath("/marketing/audiences");
}

export async function saveAudienceMatch(formData: FormData) {
  const { access } = await gate();
  const platform = String(formData.get("platform") || "");
  if (!isAudiencePlatform(platform)) fail("Choose a platform.");
  const uploaded = Number(formData.get("uploaded"));
  const matched = Number(formData.get("matched"));
  const reach = Number(formData.get("reach"));
  const spend = access.seesCost ? Number(formData.get("spend") || 0) : 0;
  if (![uploaded, matched, reach, spend].every((value) => Number.isFinite(value))) fail("Match counts must be numbers.");
  const saved = await recordPlatformMatch({
    workspaceId: access.workspaceId,
    audienceId: String(formData.get("audienceId") || ""),
    platform,
    uploaded,
    matched,
    reach,
    spend,
  });
  if (!saved.ok) fail(saved.message);
  revalidatePath("/marketing/audiences");
}

export async function requestAudienceUpload(formData: FormData) {
  const { user, access } = await gate();
  const platform = String(formData.get("platform") || "");
  if (!isAudiencePlatform(platform)) fail("Choose a platform.");
  const saved = await requestAudiencePush({
    workspaceId: access.workspaceId,
    audienceId: String(formData.get("audienceId") || ""),
    platform,
    actorId: user.id,
  });
  if (!saved.ok) fail(saved.message);
  revalidatePath("/marketing/audiences");
}

export async function decideAudienceUpload(formData: FormData) {
  const { user, access } = await gate();
  const decision = String(formData.get("decision") || "");
  const saved = await decideAudiencePush({
    workspaceId: access.workspaceId,
    pushId: String(formData.get("pushId") || ""),
    decision,
    actorId: user.id,
  });
  if (!saved.ok) fail(saved.message);
  revalidatePath("/marketing/audiences");
  revalidatePath("/marketing/audiences/pixel");
}

export async function syncPixelPool(formData: FormData) {
  const { user, access } = await gate();
  const saved = await logPoolSync({
    workspaceId: access.workspaceId,
    audienceId: String(formData.get("audienceId") || ""),
    actorId: user.id,
  });
  if (!saved.ok) redirect(`/marketing/audiences/pixel?error=${encodeURIComponent(saved.message)}`);
  revalidatePath("/marketing/audiences/pixel");
  revalidatePath("/marketing/audiences");
}

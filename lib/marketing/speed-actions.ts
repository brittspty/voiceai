"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "../audit";
import { requireStaffUser } from "../auth";
import { denyAccess } from "../deny";
import { loadMarketingAccess } from "./queries";
import { markSpeedContacted, muteSpeedLead, saveSpeedTarget, undoSpeedContact } from "./speed-to-lead-store";

function refresh(id?: string) {
  revalidatePath("/marketing");
  revalidatePath("/marketing/speed-to-lead");
  if (id) revalidatePath(`/marketing/speed-to-lead/${id}`);
}

async function editor() {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager" && user.role !== "owner" && user.role !== "admin") {
    denyAccess();
  }
  return user;
}

export async function markLeadContacted(id: string) {
  const user = await requireStaffUser();
  const result = await markSpeedContacted(id, user.id);
  if (result.status === "skipped") throw new Error("Speed-to-lead is turned off.");
  if (result.status === "missing") throw new Error("That lead was not found.");
  await audit(user, "Marked a lead contacted", { type: "lead_response", id, label: "Speed-to-lead" });
  refresh(id);
  return { ok: true as const };
}

export async function undoLeadContacted(id: string) {
  const user = await requireStaffUser();
  const result = await undoSpeedContact(id, user.id);
  if (result.status !== "undone") throw new Error("The undo window has closed.");
  await audit(user, "Undid a lead contact", { type: "lead_response", id, label: "Speed-to-lead" });
  refresh(id);
  return { ok: true as const };
}

export async function muteLeadForDay(id: string) {
  const user = await requireStaffUser();
  const result = await muteSpeedLead(id, user.id);
  if (result.status === "skipped") throw new Error("Speed-to-lead is turned off.");
  if (result.status !== "muted") throw new Error("That lead is already contacted.");
  await audit(user, "Muted a speed-to-lead alert for 24 hours", { type: "lead_response", id, label: "Speed-to-lead" });
  refresh(id);
  return { ok: true as const };
}

export async function saveSpeedTargetAction(formData: FormData) {
  const user = await editor();
  const seconds = Number(formData.get("targetSeconds"));
  if (!Number.isFinite(seconds)) throw new Error("Enter a target in seconds.");
  const saved = await saveSpeedTarget(seconds);
  if (saved.status === "skipped") throw new Error("Speed-to-lead is turned off.");
  await audit(user, "Updated the speed-to-lead target", { type: "client_sla", label: `${saved.targetSeconds} seconds` });
  refresh();
  redirect("/marketing/speed-to-lead?saved=1");
}

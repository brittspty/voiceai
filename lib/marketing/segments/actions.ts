"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaffUser } from "../../auth";
import { denyAccess } from "../../deny";
import { segmentEngineEnabled } from "../config";
import { loadMarketingAccess } from "../queries";
import { applySegmentAnswer, logBudgetFollowUp } from "./decisions";

const COOKIE = "segment_decision";

export async function answerSegmentDecision(formData: FormData) {
  if (!segmentEngineEnabled()) denyAccess();
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") denyAccess();
  const decision = String(formData.get("decision") || "");
  const jar = await cookies();
  if (decision === "undo") {
    jar.delete(COOKIE);
    revalidatePath("/marketing/segments/decisions");
    return;
  }
  if (String(formData.get("type") || "") === "budget_rec") {
    logBudgetFollowUp({
      write: async () => {
        throw new Error("Segment decisions never write a budget.");
      },
    });
    revalidatePath("/marketing/segments/decisions");
    return;
  }
  const type = String(formData.get("type") || "");
  if (type !== "segment_scale" && type !== "segment_test" && type !== "segment_cut") denyAccess();
  const choice = decision === "accept" || decision === "decline" ? decision : "dismiss";
  const result = await applySegmentAnswer({
    actor: { kind: "human", access },
    card: {
      id: String(formData.get("id") || "segment"),
      type,
      status: "verified",
      vendor: String(formData.get("vendor") || ""),
      listId: String(formData.get("listId") || ""),
    },
    decision: choice,
    budgetStore: {
      write: async () => {
        throw new Error("Segment decisions never write a budget.");
      },
    },
  });
  jar.set(COOKIE, JSON.stringify({ steps: result.manualSteps, at: result.decidedAt, type }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/marketing/segments/decisions",
    maxAge: 60 * 60,
  });
  revalidatePath("/marketing/segments/decisions");
}

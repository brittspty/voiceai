import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchWasteEnabled } from "@/lib/marketing/config";
import { accountFilter, canReviewSearchWaste, featureHttpStatus } from "@/lib/marketing/feature-access";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { REASON_LABELS, negativeKeywordCsv, presentProposal, type NegativeProposalDraft, type WasteReason } from "@/lib/marketing/search-waste";
import { markProposalsExported } from "@/lib/marketing/search-waste-store";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: searchWasteEnabled(), allowed: canReviewSearchWaste(access) && access.workspaceId.length > 0 });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const url = new URL(request.url);
  const ids = url.searchParams.getAll("id").filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "Choose at least one search." }, { status: 400 });
  const matchById: Record<string, "exact" | "phrase"> = {};
  for (const pair of url.searchParams.getAll("match")) {
    const [id, match] = pair.split(":");
    if (id && (match === "exact" || match === "phrase")) matchById[id] = match;
  }
  const rows = await markProposalsExported(access.workspaceId, ids, matchById, accountFilter(access));
  const views = rows.map((row) => presentProposal({
    id: row.id,
    workspaceId: row.workspaceId,
    adAccountId: row.adAccountId,
    campaignId: row.campaignId,
    adGroupId: row.adGroupId,
    scopeKey: row.scopeKey,
    campaignName: row.campaignName,
    adGroupName: row.adGroupName,
    term: row.term,
    matchType: matchById[row.id] === "exact" ? "exact" : "phrase",
    level: row.level,
    wasteSpend: Number(row.wasteSpend),
    currency: row.currency,
    clicks: row.clicks,
    impressions: row.impressions,
    reason: row.reason as NegativeProposalDraft["reason"],
    reasonLabel: REASON_LABELS[row.reason as WasteReason] || row.reason,
    confidence: "high",
    defaultAction: "block",
    safetyNote: row.safetyNote,
    windowStart: row.windowStart.toISOString().slice(0, 10),
    windowEnd: row.windowEnd.toISOString().slice(0, 10),
  }, access.seesCost));
  const csv = negativeKeywordCsv(views.map((view) => ({ ...view, include: true, defaultAction: "block" as const })), access.seesCost);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"negative-keywords.csv\"",
    },
  });
}

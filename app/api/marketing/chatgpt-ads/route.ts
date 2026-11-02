import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { registryMemory } from "@/lib/marketing/channels/registry";
import { canConnectChatgptAds, canSetupChatgptAds, resolveChatgptAdsKey } from "@/lib/marketing/chatgpt-ads/connect";
import { parseAdsManagerCsv } from "@/lib/marketing/chatgpt-ads/csv";
import { saveChatgptReportRows } from "@/lib/marketing/chatgpt-ads/persist";
import { loadChatgptAdsInsights, presentChatgptAdsReport } from "@/lib/marketing/chatgpt-ads/reporting";
import { chatgptAdsEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

const CLIENT_ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function GET(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!chatgptAdsEnabled()) return NextResponse.json({ message: "ChatGPT Ads is off." }, { status: 404 });
  if (!canConnectChatgptAds(access.kind)) return NextResponse.json({ message: "You cannot view ChatGPT Ads." }, { status: 403 });
  const url = new URL(request.url);
  const requested = url.searchParams.get("clientId") || "";
  const clientId = CLIENT_ID.test(requested) ? requested : access.workspaceId;
  const since = url.searchParams.get("since") || new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const until = url.searchParams.get("until") || new Date().toISOString().slice(0, 10);
  const apiKey = resolveChatgptAdsKey(registryMemory(), clientId);
  const audience = access.seesCost && canSetupChatgptAds(access.kind) ? "staff" : "client";
  if (!apiKey) {
    return NextResponse.json(presentChatgptAdsReport({ rows: [], spendLagHours: 8, attribution: "30-day click / 1-day view" }, audience));
  }
  const report = await loadChatgptAdsInsights({ apiKey, since, until });
  if (!report.ok) return NextResponse.json({ message: report.message }, { status: 400 });
  return NextResponse.json(presentChatgptAdsReport(report, audience));
}

export async function POST(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!chatgptAdsEnabled()) return NextResponse.json({ message: "ChatGPT Ads is off." }, { status: 404 });
  if (!canSetupChatgptAds(access.kind)) return NextResponse.json({ message: "Only staff can import an Ads Manager report." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { csv?: string; clientId?: string } | null;
  const parsed = parseAdsManagerCsv(body?.csv || "");
  if (!parsed.rows.length) return NextResponse.json({ message: parsed.errors[0] || "Nothing to import." }, { status: 400 });
  const clientId = typeof body?.clientId === "string" && CLIENT_ID.test(body.clientId) ? body.clientId : access.workspaceId;
  await saveChatgptReportRows(access.workspaceId, clientId, parsed.rows);
  return NextResponse.json(presentChatgptAdsReport({ rows: parsed.rows, errors: parsed.errors, imported: parsed.rows.length }, "staff"));
}

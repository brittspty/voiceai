import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveAudienceDecision } from "@/lib/marketing/audience-p1/decide";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { p1LogStore } from "@/lib/marketing/p1-log-prisma";
import { forReader, staffOnlyStatus } from "@/lib/marketing/p1-reader";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!audienceDataP1Enabled()) return NextResponse.json({ error: "Audience Data is turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const status = staffOnlyStatus(user.role);
  if (status !== 200) return NextResponse.json({ error: "Not allowed" }, { status });
  const body = (await request.json()) as { testId?: string; action?: string };
  if (body.action !== "scale" && body.action !== "cut") {
    return NextResponse.json({ error: "Choose scale or cut.", campaignWrite: false, adAccountWrite: false }, { status: 400 });
  }
  const result = await saveAudienceDecision(p1LogStore, WORKSPACE_ID, {
    testId: body.testId || "",
    action: body.action,
    who: user.name,
    at: new Date().toISOString(),
  });
  const { status: code, ...payload } = result;
  return NextResponse.json(forReader(payload, "staff"), { status: code });
}

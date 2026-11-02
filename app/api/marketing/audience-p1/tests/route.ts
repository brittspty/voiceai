import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadAudienceDecisions } from "@/lib/marketing/audience-p1/decide";
import { presentTests } from "@/lib/marketing/audience-p1/head-to-head";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { p1LogStore } from "@/lib/marketing/p1-log-prisma";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!audienceDataP1Enabled()) return NextResponse.json({ error: "Audience Data is turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const reader = readerFor(access);
  const model = presentTests(reader);
  if (reader !== "staff") return NextResponse.json(model);
  const log = await loadAudienceDecisions(p1LogStore, WORKSPACE_ID);
  return NextResponse.json({ ...model, log });
}

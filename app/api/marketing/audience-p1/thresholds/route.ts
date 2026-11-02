import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { presentThresholds } from "@/lib/marketing/audience-p1/thresholds";
import { audienceDataP1Enabled } from "@/lib/marketing/config";
import { staffOnlyStatus } from "@/lib/marketing/p1-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!audienceDataP1Enabled()) return NextResponse.json({ error: "Audience Data is turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const status = staffOnlyStatus(user.role);
  if (status !== 200) return NextResponse.json({ error: "Not allowed" }, { status });
  return NextResponse.json(presentThresholds());
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { buildChannelReport } from "@/lib/marketing/reports/p1/channel";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ channelId: string }> }) {
  if (!reportsP1Enabled()) return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const { channelId } = await context.params;
  const model = await buildChannelReport(channelId, readerFor(access));
  if (!model) return NextResponse.json({ error: "Unknown channel" }, { status: 404 });
  return NextResponse.json(model);
}

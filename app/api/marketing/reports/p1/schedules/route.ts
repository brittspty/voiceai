import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { forReader, readerFor, staffOnlyStatus } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { createSchedule, deliverScheduledReport, presentSchedules } from "@/lib/marketing/reports/p1/schedule";

export const dynamic = "force-dynamic";

function off() {
  return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
}

export async function GET() {
  if (!reportsP1Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  return NextResponse.json(presentSchedules(readerFor(access)));
}

export async function POST(request: Request) {
  if (!reportsP1Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const status = staffOnlyStatus(user.role);
  if (status !== 200) return NextResponse.json({ error: "Not allowed" }, { status });
  const body = (await request.json()) as { action?: string; id?: string; name?: string; audience?: string; moneyInCopy?: "YES" | "NO" };
  if (body.action === "deliver") {
    const entry = deliverScheduledReport(body.id || "");
    if (!entry) return NextResponse.json({ error: "Unknown schedule" }, { status: 404 });
    return NextResponse.json(forReader(entry, "staff"));
  }
  const created = createSchedule({
    name: body.name || "",
    audience: body.audience === "staff" ? "staff" : "client",
    moneyInCopy: body.moneyInCopy,
  });
  if ("error" in created) return NextResponse.json(created, { status: 400 });
  return NextResponse.json(forReader(created, "staff"));
}

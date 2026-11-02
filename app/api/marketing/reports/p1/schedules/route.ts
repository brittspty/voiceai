import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { p1LogStore } from "@/lib/marketing/p1-log-prisma";
import { forReader, readerFor, staffOnlyStatus } from "@/lib/marketing/p1-reader";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { createScheduleStored, deliverScheduleStored, loadScheduleRows, presentSchedules } from "@/lib/marketing/reports/p1/schedule";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

function off() {
  return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
}

export async function GET() {
  if (!reportsP1Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const reader = readerFor(access);
  const rows = await loadScheduleRows(p1LogStore, WORKSPACE_ID);
  const model = presentSchedules(reader, rows);
  if (reader !== "staff") return NextResponse.json(model);
  const deliveries = await p1LogStore.listDeliveries(WORKSPACE_ID);
  return NextResponse.json({ ...model, deliveries });
}

export async function POST(request: Request) {
  if (!reportsP1Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const status = staffOnlyStatus(user.role);
  if (status !== 200) return NextResponse.json({ error: "Not allowed" }, { status });
  const body = (await request.json()) as { action?: string; id?: string; name?: string; audience?: string; moneyInCopy?: "YES" | "NO" };
  if (body.action === "deliver") {
    const entry = await deliverScheduleStored(p1LogStore, WORKSPACE_ID, body.id || "");
    if (!entry) return NextResponse.json({ error: "Unknown schedule" }, { status: 404 });
    return NextResponse.json(forReader(entry, "staff"));
  }
  const created = await createScheduleStored(p1LogStore, WORKSPACE_ID, {
    name: body.name || "",
    audience: body.audience === "staff" ? "staff" : "client",
    moneyInCopy: body.moneyInCopy,
  });
  if ("error" in created) return NextResponse.json(created, { status: 400 });
  return NextResponse.json(forReader(created, "staff"));
}

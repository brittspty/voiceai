import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { p1LogStore } from "@/lib/marketing/p1-log-prisma";
import { staffOnlyStatus } from "@/lib/marketing/p1-reader";
import { saveChartAnnotation } from "@/lib/marketing/reports/p1/annotations";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!reportsP1Enabled()) return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const status = staffOnlyStatus(user.role);
  if (status !== 200) return NextResponse.json({ error: "Not allowed" }, { status });
  const body = (await request.json()) as { seriesId?: string; date?: string; body?: string };
  const note = await saveChartAnnotation(p1LogStore, WORKSPACE_ID, {
    seriesId: body.seriesId || "",
    date: body.date || "",
    body: body.body || "",
    authorName: user.name,
    loggedAt: new Date().toISOString(),
  });
  if ("error" in note) return NextResponse.json(note, { status: 400 });
  return NextResponse.json(note);
}

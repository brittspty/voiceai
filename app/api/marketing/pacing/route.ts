import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pacingRecsEnabled } from "@/lib/marketing/config";
import { pacingAccessStatus } from "@/lib/marketing/feature-gates";
import { loadPacingBoard } from "@/lib/marketing/pacing-job";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (pacingAccessStatus(access) !== 200) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!pacingRecsEnabled()) {
    return NextResponse.json({ enabled: false, recommendationOnly: true, writesBudget: false, bars: [] });
  }
  const board = await loadPacingBoard(access);
  return NextResponse.json(board);
}

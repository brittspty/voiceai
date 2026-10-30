import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { creativeFatigueEnabled } from "@/lib/marketing/config";
import { loadFatigueBoard } from "@/lib/marketing/fatigue-job";
import { fatigueAccessStatus } from "@/lib/marketing/feature-gates";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (fatigueAccessStatus(access) !== 200) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!creativeFatigueEnabled()) return NextResponse.json({ enabled: false, ads: [] });
  const board = await loadFatigueBoard(access);
  return NextResponse.json(board);
}

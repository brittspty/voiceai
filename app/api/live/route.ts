import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOverview } from "@/lib/queries";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const range = new URL(request.url).searchParams.get("range") || "today";
  const data = await getOverview(range);
  return NextResponse.json({
    live: data.live,
    kpis: data.kpis,
    funnel: data.funnel,
    outcomes: data.outcomes,
    offices: data.offices,
  });
}

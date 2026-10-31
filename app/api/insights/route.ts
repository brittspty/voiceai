import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { insightsEnabled, insightsHttpStatus, insightsPayload } from "@/lib/insights/learn";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  const enabled = insightsEnabled();
  const user = await getCurrentUser();
  const access = user ? await loadMarketingAccess(user) : null;
  const status = insightsHttpStatus({ enabled, signedIn: Boolean(user), kind: access?.kind ?? null, share: false });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  if (status === 401) return NextResponse.json({ error: "Sign in required" }, { status });
  if (status !== 200) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json(insightsPayload());
}

import { NextResponse } from "next/server";
import { insightsEnabled, insightsHttpStatus } from "@/lib/insights/learn";

/** Share links never receive cross-client insights. */
export async function GET() {
  const status = insightsHttpStatus({ enabled: insightsEnabled(), signedIn: false, kind: null, share: true });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  return NextResponse.json({ error: "Not allowed" }, { status: 403 });
}

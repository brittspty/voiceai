import { NextResponse } from "next/server";
import { insightsEnabled, insightsHttpStatus } from "@/lib/insights/learn";
import { readScopedClient } from "@/lib/marketing/client-contract";

/** Share links never receive cross-client insights. */
export async function GET() {
  const status = insightsHttpStatus({ enabled: insightsEnabled(), signedIn: false, kind: null, share: true });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  const scoped = readScopedClient({
    kind: "share",
    ownClientId: "share",
    assignedClientIds: [],
    requestedClientId: "other",
    payload: {},
  });
  return NextResponse.json({ error: scoped.ok ? "Not allowed" : scoped.error }, { status: 403 });
}

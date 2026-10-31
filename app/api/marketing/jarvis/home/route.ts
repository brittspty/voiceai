import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EXAMPLE_ASSIGNMENTS, clientChannelPayload } from "@/lib/marketing/channels/catalog";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET(request: Request) {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (access.kind === "none") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const requested = new URL(request.url).searchParams.get("client") || "";
  if (access.kind === "client_owner" || access.kind === "client_viewer") {
    const own = access.workspaceId || "harbor";
    const scoped = readScopedClient({
      kind: access.kind,
      ownClientId: own,
      assignedClientIds: [own],
      requestedClientId: requested || own,
      payload: { ...clientChannelPayload(), spend: 8300, budget: 100, cost: 12, cpl: 41, cpql: 124, roas: 3.2 },
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    return NextResponse.json(scoped.body);
  }
  if (access.kind === "account_manager" && requested) {
    const scoped = readScopedClient({
      kind: "account_manager",
      ownClientId: access.workspaceId,
      assignedClientIds: EXAMPLE_ASSIGNMENTS.dana,
      requestedClientId: requested,
      payload: { qualified: 71, spend: 8300, cpl: 41, cpql: 124, roas: 3.2, leads: 212 },
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    return NextResponse.json(scoped.body);
  }
  return NextResponse.json({ qualified: 71, spend: 8300, cpl: 41, cpql: 124, roas: 3.2, leads: 212 });
}

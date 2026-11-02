import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { registryMemory, replaceRegistryMemory } from "@/lib/marketing/channels/registry";
import { canConnectChatgptAds, connectChatgptAds, disconnectChatgptAds, presentChatgptConnection } from "@/lib/marketing/chatgpt-ads/connect";
import { chatgptAdsEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

const CLIENT_ID = /^[A-Za-z0-9_-]{1,80}$/;

function clientIdOf(fallback: string, value: unknown) {
  const id = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return CLIENT_ID.test(id) ? id : "";
}

export async function GET(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!chatgptAdsEnabled()) return NextResponse.json({ message: "ChatGPT Ads is off." }, { status: 404 });
  if (!canConnectChatgptAds(access.kind)) return NextResponse.json({ message: "You cannot view this connection." }, { status: 403 });
  const clientId = clientIdOf(access.workspaceId, new URL(request.url).searchParams.get("clientId"));
  if (!clientId) return NextResponse.json({ message: "Client is not valid." }, { status: 400 });
  return NextResponse.json({ view: presentChatgptConnection(registryMemory(), clientId) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!chatgptAdsEnabled()) return NextResponse.json({ message: "ChatGPT Ads is off." }, { status: 404 });
  if (!canConnectChatgptAds(access.kind)) return NextResponse.json({ message: "Only staff or the client owner can connect ChatGPT Ads." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { action?: string; clientId?: string; apiKey?: string; confirm?: boolean } | null;
  if (!body) return NextResponse.json({ message: "The request could not be read." }, { status: 400 });
  const clientId = clientIdOf(access.workspaceId, body.clientId);
  if (!clientId) return NextResponse.json({ message: "Client is not valid." }, { status: 400 });
  const actor = { id: user.id, kind: access.kind };
  if (body.action === "disconnect") {
    const result = disconnectChatgptAds({ state: registryMemory(), actor, clientId, confirm: body.confirm === true });
    if (result.ok) replaceRegistryMemory(result.state);
    return NextResponse.json(result.ok ? { view: result.view } : { message: result.message }, { status: result.status });
  }
  if (body.action && body.action !== "connect" && body.action !== "rotate") {
    return NextResponse.json({ message: "That action is not available." }, { status: 400 });
  }
  const result = await connectChatgptAds({
    state: registryMemory(),
    actor,
    clientId,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
  });
  if (result.ok) replaceRegistryMemory(result.state);
  return NextResponse.json(result.ok ? { view: result.view } : { message: result.message }, { status: result.status });
}

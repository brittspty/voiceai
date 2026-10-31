import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleChannelRegistryHttp, registryMemory, replaceRegistryMemory } from "@/lib/marketing/channels/registry";
import { channelRegistryEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

async function actor() {
  const user = await getCurrentUser();
  if (!user) return null;
  const access = await loadMarketingAccess(user);
  return { kind: access.kind, role: access.role, email: access.email, name: user.name, seesCost: access.seesCost };
}

export async function GET() {
  const result = handleChannelRegistryHttp({
    method: "GET",
    enabled: channelRegistryEnabled(),
    actor: await actor(),
    state: registryMemory(),
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = handleChannelRegistryHttp({
    method: "POST",
    enabled: channelRegistryEnabled(),
    actor: await actor(),
    body,
    state: registryMemory(),
  });
  if (result.status === 200) replaceRegistryMemory(result.state);
  return NextResponse.json(result.body, { status: result.status });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { canManageAudiences, featureHttpStatus } from "@/lib/marketing/feature-access";
import { isAudiencePlatform } from "@/lib/marketing/audiences/payloads";
import { normalizeAudienceDecision } from "@/lib/marketing/audiences/push";
import { decideAudiencePush, requestAudiencePush } from "@/lib/marketing/audiences/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: audienceLibraryEnabled(), allowed: canManageAudiences(access) });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const body = (await request.json().catch(() => null)) as { audienceId?: string; platform?: string; pushId?: string; decision?: string } | null;
  if (!body) return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  if (body.pushId) {
    if (!body.decision || !normalizeAudienceDecision(body.decision)) {
      return NextResponse.json({ error: "Choose Yes or No." }, { status: 400 });
    }
    const saved = await decideAudiencePush({
      workspaceId: access.workspaceId,
      pushId: body.pushId,
      decision: body.decision,
      actorId: user.id,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 400 });
    return NextResponse.json({ mode: saved.mode, called: saved.called, log: saved.log, steps: saved.steps });
  }
  if (!body.platform || !isAudiencePlatform(body.platform) || !body.audienceId) {
    return NextResponse.json({ error: "Choose an audience and a platform." }, { status: 400 });
  }
  const saved = await requestAudiencePush({
    workspaceId: access.workspaceId,
    audienceId: body.audienceId,
    platform: body.platform,
    actorId: user.id,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 400 });
  return NextResponse.json({ id: saved.id, status: "pending" });
}

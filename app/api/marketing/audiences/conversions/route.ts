import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { canManageAudiences, featureHttpStatus } from "@/lib/marketing/feature-access";
import { recordAudienceConversion } from "@/lib/marketing/audiences/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: audienceLibraryEnabled(), allowed: canManageAudiences(access) });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const body = (await request.json().catch(() => null)) as {
    audienceId?: string;
    visitorId?: string;
    externalId?: string;
    kind?: "lead" | "sale";
    qualified?: boolean;
    maid?: string;
    idType?: "idfa" | "gaid";
    email?: string;
    phone?: string;
  } | null;
  if (!body?.audienceId || !body.externalId) return NextResponse.json({ error: "A conversion needs an audience and an id." }, { status: 400 });
  const saved = await recordAudienceConversion({
    workspaceId: access.workspaceId,
    audienceId: body.audienceId,
    visitorId: body.visitorId || "",
    externalId: body.externalId,
    kind: body.kind === "sale" ? "sale" : "lead",
    qualified: Boolean(body.qualified),
    maid: body.maid,
    idType: body.idType,
    email: body.email,
    phone: body.phone,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 400 });
  return NextResponse.json({ status: saved.conversion.status, reason: saved.conversion.reason });
}

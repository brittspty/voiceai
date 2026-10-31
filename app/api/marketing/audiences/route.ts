import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { canUseAudienceLibrary, featureHttpStatus } from "@/lib/marketing/feature-access";
import { presentLibrary } from "@/lib/marketing/audiences/library";
import { listLibraryAudiences } from "@/lib/marketing/audiences/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: audienceLibraryEnabled(), allowed: canUseAudienceLibrary(access) });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const rows = await listLibraryAudiences(access.workspaceId);
  const reader = access.kind === "client_owner" || access.kind === "client_viewer" ? "client" : "staff";
  return NextResponse.json(presentLibrary(rows, { reader, seesCost: access.seesCost }));
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audienceLibraryEnabled } from "@/lib/marketing/config";
import { canManageAudiences, featureHttpStatus } from "@/lib/marketing/feature-access";
import { importMaidApi, importOptionsFromEnv, staffCost } from "@/lib/marketing/audiences/import";
import { importMaidAudience } from "@/lib/marketing/audiences/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: audienceLibraryEnabled(), allowed: canManageAudiences(access) });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const body = await request.json().catch(() => null);
  const parsed = importMaidApi(body, importOptionsFromEnv());
  if (!parsed.ok) return NextResponse.json({ error: parsed.issues[0]?.message || "Import failed", issues: parsed.issues }, { status: 400 });
  const stored = {
    ...parsed.value,
    lineage: { ...parsed.value.lineage, cost: staffCost(access.seesCost, parsed.value.lineage.cost) },
  };
  const saved = await importMaidAudience(access.workspaceId, stored);
  if (!saved.ok) return NextResponse.json({ error: saved.message }, { status: 400 });
  return NextResponse.json({ id: saved.id, duplicates: saved.duplicates, rejected: saved.rejected, rawStored: stored.rawStored });
}

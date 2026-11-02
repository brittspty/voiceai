import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fixtureByLocation } from "@/lib/marketing/connectors/gbp-fixtures";
import { profileFieldsHash } from "@/lib/marketing/connectors/gbp-client";
import { rememberGbpAssignment } from "@/lib/marketing/gbp-mapping";
import { assignFromSetup, buildGbpSetup, canManageGbp } from "@/lib/marketing/gbp-view";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  if (!canManageGbp(access.kind)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { locationId?: string; marketingClientId?: string };
  const result = assignFromSetup({ locationId: String(body.locationId || ""), marketingClientId: String(body.marketingClientId || "") });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  rememberGbpAssignment(String(body.locationId), String(body.marketingClientId));
  const fixture = fixtureByLocation(String(body.locationId));
  if (fixture) {
    try {
      const { prisma } = await import("@/lib/db");
      const client = await prisma.marketingClient.findFirst({ where: { id: String(body.marketingClientId), workspaceId: WORKSPACE_ID }, select: { id: true } });
      const profile = fixture.report.profile;
      const data = {
        accountId: fixture.accountId,
        marketingClientId: client?.id ?? null,
        title: profile.title,
        primaryCategory: profile.primaryCategory,
        additionalCategories: profile.additionalCategories,
        phone: profile.phone,
        websiteUri: profile.websiteUri,
        address: profile.address,
        hours: { regular: profile.regularHours, special: profile.specialHours } as Prisma.InputJsonValue,
        attributes: fixture.report.attributes,
        services: profile.services,
        description: profile.description,
        verificationState: profile.verificationState,
        fieldsHash: profileFieldsHash(profile),
        photoCount: fixture.report.photoCount,
        lastPhotoAt: fixture.report.lastPhotoAt ? new Date(fixture.report.lastPhotoAt) : null,
        hasLogo: fixture.report.hasLogo,
        hasCover: fixture.report.hasCover,
        postCount: fixture.report.postCount,
        lastPostAt: fixture.report.lastPostAt ? new Date(fixture.report.lastPostAt) : null,
        fetchedAt: new Date(),
      };
      await prisma.gbpLocation.upsert({
        where: { workspaceId_locationId: { workspaceId: WORKSPACE_ID, locationId: fixture.locationId } },
        create: { workspaceId: WORKSPACE_ID, locationId: fixture.locationId, ...data },
        update: data,
      });
    } catch {
      // Mock mode keeps the assignment in memory when the table is not reachable.
    }
  }
  return NextResponse.json({ setup: buildGbpSetup() });
}

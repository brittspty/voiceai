import type { Metadata } from "next";
import { GoogleAdsConnection } from "@/components/google-ads-connection";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { canViewGoogleAdsConnection, loadGoogleAdsConnectionView } from "@/lib/marketing/google-connection";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Google Ads" };

export default async function GoogleAdsConnectionPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canViewGoogleAdsConnection(access)) denyAccess();
  const [view, org] = await Promise.all([loadGoogleAdsConnectionView(), getOrg()]);
  return (
    <div>
      <PageTitle
        title="Google Ads"
        subtitle="Read only. Campaigns, ads, and search terms. This screen never asks for a password."
      />
      <GoogleAdsConnection view={view} timeZone={org.timezone || "America/New_York"} canManage={access.kind === "super_admin"} />
    </div>
  );
}

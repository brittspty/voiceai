import { headers } from "next/headers";
import { LandingPagesView } from "@/components/landing-pages-view";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { loadMarketingAccess, recordClientView } from "@/lib/marketing/queries";
import { loadLandingScreen } from "@/lib/marketing/pages/store";

export const dynamic = "force-dynamic";

export default async function LandingPagesPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "none" || (access.kind === "client_viewer" && !access.workspaceId)) return <NoAccess title="Landing pages" />;
  if (access.kind === "client_viewer") {
    const meta = requestClientMeta(await headers());
    await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/sites/landing-pages", ...meta });
  }
  const screen = await loadLandingScreen({
    audience: access.kind === "client_viewer" ? "client" : "staff",
    canManage: access.kind === "super_admin" || access.kind === "account_manager",
    canEditCredentials: access.kind === "super_admin",
  });
  return <LandingPagesView screen={screen} />;
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClientPerformance } from "@/components/client-performance";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadClientPerformance, loadMarketingAccess, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";

export const dynamic = "force-dynamic";

export default async function ClientMarketingPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "client_viewer" || !access.workspaceId) redirect("/marketing");
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const payload = await loadClientPerformance(org?.name || "Performance");
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: access.workspaceId, viewerUserId: user.id, page: "/marketing/client", ...meta });
  return <ClientPerformance data={payload} />;
}

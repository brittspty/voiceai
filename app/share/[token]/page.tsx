import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ClientPerformance } from "@/components/client-performance";
import { BrandLockup } from "@/components/brand-lockup";
import { prisma } from "@/lib/db";
import { clientViewerCsv } from "@/lib/marketing/client-view";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { hashShareToken, shareLinkState } from "@/lib/marketing/share-link";

export const dynamic = "force-dynamic";

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ export?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const link = await prisma.clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) } });
  const state = shareLinkState(link, new Date());
  if (state === "disabled") {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <BrandLockup />
        <p className="mt-6 text-sm text-muted">Client links are turned off.</p>
      </main>
    );
  }
  if (state !== "ok" || !link) notFound();
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const payload = await loadClientPerformance(org?.name || "Performance");
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: link.workspaceId, shareLinkId: link.id, page: query.export ? "/share/export" : "/share", ...meta });
  if (query.export === "csv") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <BrandLockup />
        <pre className="mt-4 overflow-auto rounded-xl border border-line bg-card p-4 text-xs">{clientViewerCsv(payload)}</pre>
      </main>
    );
  }
  return (
    <main>
      <div className="border-b border-line px-4 py-4">
        <BrandLockup />
      </div>
      <ClientPerformance data={payload} />
    </main>
  );
}

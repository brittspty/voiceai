import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ClientPerformance } from "@/components/client-performance";
import { BrandFooter, BrandLockup } from "@/components/brand-lockup";
import { prisma } from "@/lib/db";
import { clientShareCsv } from "@/lib/marketing/client-view";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { hashShareToken, shareLinkState } from "@/lib/marketing/share-link";

export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <header className="flex items-center gap-3 border-b-[3px] border-brand bg-card px-4 py-3">
        <BrandLockup />
      </header>
      {children}
      <BrandFooter />
    </main>
  );
}

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ export?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const link = await prisma.clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) }, include: { createdBy: { select: { name: true } } } });
  const state = shareLinkState(link, new Date());
  if (state === "disabled") {
    return (
      <Frame>
        <p className="px-4 py-8 text-sm text-muted">Client links are turned off.</p>
      </Frame>
    );
  }
  if (state === "expired") {
    return (
      <Frame>
        <p className="px-4 py-8">This link has expired. Ask {link?.createdBy.name || "your marketing team"} for a new one.</p>
      </Frame>
    );
  }
  if (state === "revoked") {
    return (
      <Frame>
        <p className="px-4 py-8">This link is no longer active.</p>
      </Frame>
    );
  }
  if (state !== "ok" || !link) notFound();
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const expires = link.expiresAt ? `expires ${link.expiresAt.toISOString().slice(0, 10)}` : "";
  const payload = await loadClientPerformance(org?.name || "Performance", { sharedBy: link.createdBy.name, expires });
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: link.workspaceId, shareLinkId: link.id, page: query.export ? "/share/export" : "/share", ...meta });
  if (query.export === "csv") {
    return (
      <Frame>
        <pre className="overflow-auto px-4 py-6 text-xs">{clientShareCsv(payload)}</pre>
      </Frame>
    );
  }
  return (
    <Frame>
      <ClientPerformance data={payload} />
    </Frame>
  );
}

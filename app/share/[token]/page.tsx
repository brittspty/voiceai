import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ClientPerformance } from "@/components/client-performance";
import { BrandFooter, BrandLockup } from "@/components/brand-lockup";
import { prisma } from "@/lib/db";
import { clientShareCsv } from "@/lib/marketing/client-view";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { hashShareToken, passcodeCookieValue, shareLinkState } from "@/lib/marketing/share-link";

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

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ export?: string; range?: string }> }) {
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
  if (link.passcodeHash) {
    const jar = await cookies();
    const ok = jar.get("voiceops_share_pass")?.value === passcodeCookieValue(link.id, link.passcodeHash);
    if (!ok) {
      return (
        <Frame>
          <form className="mx-auto max-w-sm space-y-3 px-4 py-8" method="post" action={`/api/share/${token}/passcode`}>
            <p>This link needs a code.</p>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" className="h-11 w-full rounded-lg border border-line px-3" aria-label="Passcode" />
            <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-ink">Continue</button>
          </form>
        </Frame>
      );
    }
  }
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const expires = link.expiresAt ? `expires ${link.expiresAt.toISOString().slice(0, 10)}` : "";
  const payload = await loadClientPerformance(org?.name || "Performance", { sharedBy: link.createdBy.name, expires, range: query.range });
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
      <form className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pt-4 text-sm" method="get">
        <label>
          Dates{" "}
          <select name="range" defaultValue={query.range || "7"} className="h-11 rounded-lg border border-line bg-card px-2">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="last-month">Last month</option>
          </select>
        </label>
        <button className="min-h-11 rounded-lg border border-line bg-card px-3">Show</button>
      </form>
      <ClientPerformance data={payload} />
    </Frame>
  );
}

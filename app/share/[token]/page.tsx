import { cookies, headers } from "next/headers";
import { ClientPerformance } from "@/components/client-performance";
import { BrandFooter, BrandLockup } from "@/components/brand-lockup";
import { prisma } from "@/lib/db";
import { clientShareCsv } from "@/lib/marketing/client-view";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { hashShareToken, passcodePrompt, SHARE_PASS_COOKIE, shareAccessDecision, shareLinkState } from "@/lib/marketing/share-link";

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

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ export?: string; range?: string; code?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  let link: Awaited<ReturnType<typeof prisma.clientShareLink.findUnique>> & { createdBy?: { name: string } } | null = null;
  let agentName = "";
  try {
    const [found, org] = await Promise.all([
      prisma.clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) }, include: { createdBy: { select: { name: true } } } }),
      prisma.org.findUnique({ where: { id: "org" }, select: { agentName: true, name: true } }),
    ]);
    link = found;
    agentName = org?.agentName || "";
  } catch {
    link = null;
  }
  const manager = link?.createdBy?.name && link.createdBy.name !== agentName ? link.createdBy.name : "your account manager";
  const invalid = (
    <Frame>
      <p className="px-4 py-10 text-lg">This link isn&apos;t valid. Ask {manager} for a new one.</p>
    </Frame>
  );
  const jar = await cookies();
  const decision = shareAccessDecision({
    state: shareLinkState(link, new Date()),
    linkId: link?.id ?? "",
    passcodeHash: link?.passcodeHash ?? null,
    cookie: jar.get(SHARE_PASS_COOKIE)?.value,
  });
  if (decision === "disabled" || decision === "not_found" || !link) return invalid;
  if (decision === "passcode") {
    return (
      <Frame>
        <form className="mx-auto max-w-sm space-y-3 px-4 py-8" method="post" action={`/api/share/${token}/passcode`}>
          <p>{passcodePrompt(query.code)}</p>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" className="h-11 w-full rounded-lg border border-line px-3" aria-label="Passcode" />
          <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand">Continue</button>
        </form>
      </Frame>
    );
  }
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const expires = link.expiresAt ? `expires ${link.expiresAt.toISOString().slice(0, 10)}` : "";
  const payload = await loadClientPerformance(org?.name || "Performance", {
    workspaceId: link.workspaceId,
    adAccountIds: "all",
    sharedBy: manager,
    expires,
    range: query.range,
  });
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

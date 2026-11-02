import { cookies, headers } from "next/headers";
import { ClientPerformance } from "@/components/client-performance";
import { MarketingDashboard } from "@/components/marketing-dashboard";
import { ShareChrome } from "@/components/share-chrome";
import { ReportFrame } from "@/components/reports/report-frame";
import { ReportScreen } from "@/components/reports/report-screen";
import { prisma } from "@/lib/db";
import { clientShareCsv, reopenClientReport } from "@/lib/marketing/client-view";
import { dashboardsV2Enabled, reportsP1Enabled, reportsV2Enabled } from "@/lib/marketing/config";
import { materializeShare } from "@/lib/marketing/reports/p1/share";
import { parseDashQuery } from "@/lib/marketing/dashboard-model";
import { loadClientDashboard } from "@/lib/marketing/dashboard-query";
import { loadFeatureCards } from "@/lib/marketing/home-query";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { hashShareToken, passcodePrompt, SHARE_PASS_COOKIE, shareAccessDecision, shareLinkState } from "@/lib/marketing/share-link";

export const dynamic = "force-dynamic";

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const query = await searchParams;
  const code = typeof query.code === "string" ? query.code : undefined;
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
    <ShareChrome>
      <p className="px-4 py-10 text-lg">This link isn&apos;t valid. Ask {manager} for a new one.</p>
    </ShareChrome>
  );
  const jar = await cookies();
  const state = shareLinkState(link, new Date());
  if (reportsV2Enabled() && state === "revoked") {
    return (
      <ShareChrome>
        <p className="px-4 py-10 text-lg">This link was turned off.</p>
      </ShareChrome>
    );
  }
  const decision = shareAccessDecision({
    state,
    linkId: link?.id ?? "",
    passcodeHash: link?.passcodeHash ?? null,
    cookie: jar.get(SHARE_PASS_COOKIE)?.value,
  });
  if (decision === "disabled" || decision === "not_found" || !link) return invalid;
  if (decision === "passcode") {
    return (
      <ShareChrome>
        <form className="mx-auto max-w-sm space-y-3 px-4 py-8" method="post" action={`/api/share/${token}/passcode`}>
          <p>{passcodePrompt(code)}</p>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" className="h-11 w-full rounded-lg border border-line px-3" aria-label="Passcode" />
          <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand">Continue</button>
        </form>
      </ShareChrome>
    );
  }
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const expires = link.expiresAt ? `expires ${link.expiresAt.toISOString().slice(0, 10)}` : "";
  const range = typeof query.range === "string" ? query.range : undefined;
  const exporting = query.export === "csv";
  const meta = requestClientMeta(await headers());
  await recordClientView({ workspaceId: link.workspaceId, shareLinkId: link.id, page: exporting ? "/share/export" : "/share", ...meta });
  let sharedReport: ReturnType<typeof reopenClientReport> | null = null;
  if (reportsV2Enabled() && link.snapshot && !exporting) {
    try {
      sharedReport = await materializeShare(link.snapshot, reportsP1Enabled());
    } catch {
      sharedReport = null;
    }
    if (!sharedReport) return invalid;
    return (
      <ReportFrame>
        <ReportScreen initial={sharedReport} mode="share" canShare={false} canStaffPdf={false} pdfDefault="client" pollUrl={null} />
      </ReportFrame>
    );
  }
  if (exporting) {
    const payload = await loadClientPerformance(org?.name || "Performance", {
      sharedBy: manager,
      expires,
      range,
      workspaceId: link.workspaceId,
      adAccountIds: "all",
    });
    return (
      <ShareChrome>
        <pre className="overflow-auto px-4 py-6 text-xs">{clientShareCsv(payload)}</pre>
      </ShareChrome>
    );
  }
  if (dashboardsV2Enabled()) {
    const [data, features] = await Promise.all([
      loadClientDashboard(link.workspaceId, org?.name || "Campaigns"),
      loadFeatureCards({ workspaceIds: [link.workspaceId], showMoney: false }),
    ]);
    return (
      <ShareChrome>
        <MarketingDashboard model={data} query={parseDashQuery(query)} basePath={`/share/${token}`} features={features} />
      </ShareChrome>
    );
  }
  const payload = await loadClientPerformance(org?.name || "Performance", {
    sharedBy: manager,
    expires,
    range,
    workspaceId: link.workspaceId,
    adAccountIds: "all",
  });
  return (
    <ShareChrome>
      <form className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pt-4 text-sm" method="get">
        <label>
          Dates{" "}
          <select name="range" defaultValue={range || "7"} className="h-11 rounded-lg border border-line bg-card px-2">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="last-month">Last month</option>
          </select>
        </label>
        <button className="min-h-11 rounded-lg border border-line bg-card px-3">Show</button>
      </form>
      <ClientPerformance data={payload} />
    </ShareChrome>
  );
}

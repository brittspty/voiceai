import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readScopedClient } from "@/lib/marketing/client-contract";
import { clientShareCsv, type ClientShareView } from "@/lib/marketing/client-view";
import { clientMetricVisibilityEnabled, reportsP1Enabled, reportsV2Enabled } from "@/lib/marketing/config";
import { applyClientSurface } from "@/lib/marketing/metric-visibility";
import { loadResolvedVisibility } from "@/lib/marketing/metric-visibility-store";
import { materializeShare } from "@/lib/marketing/reports/p1/share";
import { presentForAudience } from "@/lib/marketing/share-payload";
import { buildReportPdf } from "@/lib/marketing/reports/pdf";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { ctvExportCsv, type CtvChannelPage } from "@/lib/marketing/ctv/channel";
import { attachShareCtv } from "@/lib/marketing/ctv/sync";
import { hashShareToken, SHARE_PASS_COOKIE, shareAccessDecision, shareHttpStatus, shareLinkState } from "@/lib/marketing/share-link";

async function releaseShare<T>(workspaceId: string, payload: T): Promise<T> {
  if (!clientMetricVisibilityEnabled()) return payload;
  return applyClientSurface(payload, await loadResolvedVisibility(workspaceId));
}

function shareResponse(response: NextResponse) {
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

async function openLink(token: string) {
  const link = await prisma.clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) } });
  const state = shareLinkState(link, new Date());
  return { link, state };
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const { link, state } = await openLink(token);
  const jar = await cookies();
  const decision = shareAccessDecision({
    state,
    linkId: link?.id ?? "",
    passcodeHash: link?.passcodeHash ?? null,
    cookie: jar.get(SHARE_PASS_COOKIE)?.value,
  });
  if (reportsV2Enabled() && state === "revoked") {
    return shareResponse(NextResponse.json({ error: "This link was turned off" }, { status: shareHttpStatus(state, true) }));
  }
  if (decision === "disabled") return shareResponse(NextResponse.json({ error: "Client links are turned off" }, { status: 404 }));
  if (decision === "passcode") return shareResponse(NextResponse.json({ error: "This link needs a code." }, { status: 401 }));
  if (decision !== "ok" || !link) return shareResponse(NextResponse.json({ error: "Link not found" }, { status: 404 }));
  const meta = requestClientMeta(request.headers);
  const url = new URL(request.url);
  const isExport = url.pathname.endsWith("/export");
  await recordClientView({
    workspaceId: link.workspaceId,
    shareLinkId: link.id,
    page: isExport ? "/api/share/export" : "/api/share",
    ...meta,
  });
  if (reportsV2Enabled() && link.snapshot) {
    try {
      const opened = await materializeShare(link.snapshot, reportsP1Enabled());
      const scopedReport = readScopedClient({
        kind: "share",
        ownClientId: link.workspaceId,
        assignedClientIds: [link.workspaceId],
        requestedClientId: link.workspaceId,
        payload: opened,
      });
      if (!scopedReport.ok) return shareResponse(NextResponse.json({ error: scopedReport.error }, { status: scopedReport.status }));
      const report = await releaseShare(link.workspaceId, presentForAudience(scopedReport.body, "share"));
      if (isExport) {
        const pdf = buildReportPdf(report);
        return shareResponse(new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"report.pdf\"" } }));
      }
      return shareResponse(NextResponse.json(report));
    } catch {
      return shareResponse(NextResponse.json({ error: "This report can't be shown." }, { status: 404 }));
    }
  }
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const loaded = await loadClientPerformance(org?.name || "Performance", { workspaceId: link.workspaceId, adAccountIds: "all" });
  const scoped = readScopedClient({
    kind: "share",
    ownClientId: link.workspaceId,
    assignedClientIds: [link.workspaceId],
    requestedClientId: link.workspaceId,
    payload: loaded,
  });
  if (!scoped.ok) return shareResponse(NextResponse.json({ error: scoped.error }, { status: scoped.status }));
  const payload = presentForAudience(scoped.body, "share") as ClientShareView;
  const shared = await releaseShare(link.workspaceId, await attachShareCtv(payload));
  if (isExport) {
    const extra = ctvExportCsv((shared as { ctvChannel?: CtvChannelPage | null }).ctvChannel);
    const csv = extra ? `${clientShareCsv(payload)}\n${extra}` : clientShareCsv(payload);
    return shareResponse(new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8" } }));
  }
  return shareResponse(NextResponse.json(shared));
}

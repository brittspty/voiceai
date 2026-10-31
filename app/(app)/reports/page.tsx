import { redirect } from "next/navigation";
import { ReportsPage } from "@/components/jarvis/pages";
import { ReportFrame } from "@/components/reports/report-frame";
import { ReportScreen } from "@/components/reports/report-screen";
import { requireUser } from "@/lib/auth";
import { jarvisUiV2Enabled, reportsV2Enabled } from "@/lib/marketing/config";
import { buildReport } from "@/lib/marketing/reports/guard";
import { SHARE_LINK_DEFAULT_MS } from "@/lib/marketing/share-link";

export const dynamic = "force-dynamic";

export default async function ReportsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (reportsV2Enabled()) {
    const query = await searchParams;
    const built = await buildReport(user, query);
    if (!built) redirect(user.role === "client_viewer" ? "/marketing/client" : "/marketing");
    const poll = new URLSearchParams();
    poll.set("range", built.report.range);
    poll.set("compare", built.report.compare);
    poll.set("client", built.report.clientId);
    poll.set("view", built.report.audience);
    if (built.report.range === "custom") {
      const start = typeof query.start === "string" ? query.start : "";
      const end = typeof query.end === "string" ? query.end : "";
      if (start) poll.set("start", start);
      if (end) poll.set("end", end);
    }
    return (
      <ReportFrame>
        <ReportScreen
          key={`${built.report.audience}:${built.report.clientId}:${built.report.range}:${built.report.compare}`}
          initial={built.report}
          mode="app"
          canShare={built.canShare}
          canStaffPdf={built.canStaffPdf}
          pdfDefault="client"
          pollUrl={`/api/marketing/reports?${poll.toString()}`}
          shareOpen={query.share === "open" && built.canShare}
        />
      </ReportFrame>
    );
  }
  if (jarvisUiV2Enabled()) return <ReportsPage expiryDays={SHARE_LINK_DEFAULT_MS / 86_400_000} />;
  redirect(user.role === "client_viewer" ? "/marketing/client" : "/marketing/links");
}

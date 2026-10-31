import { redirect } from "next/navigation";
import { ReportScreen } from "@/components/reports/report-screen";
import { ReportFrame } from "@/components/reports/report-frame";
import { requireUser } from "@/lib/auth";
import { reportsV2Enabled } from "@/lib/marketing/config";
import { buildReport } from "@/lib/marketing/reports/guard";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!reportsV2Enabled()) redirect(user.role === "client_viewer" ? "/marketing/client" : "/marketing");
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
  const share = query.share === "open";
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
        shareOpen={share === true && built.canShare}
      />
    </ReportFrame>
  );
}

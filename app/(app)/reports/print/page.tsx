import { redirect } from "next/navigation";
import { PrintReport } from "@/components/reports/print-report";
import { ReportFrame } from "@/components/reports/report-frame";
import { requireUser } from "@/lib/auth";
import { reportsV2Enabled } from "@/lib/marketing/config";
import { buildReport } from "@/lib/marketing/reports/guard";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!reportsV2Enabled()) redirect("/marketing");
  const user = await requireUser();
  const built = await buildReport(user, await searchParams);
  if (!built) redirect("/marketing");
  return (
    <ReportFrame tone="light">
      <PrintReport report={built.report} />
    </ReportFrame>
  );
}

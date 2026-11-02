import { redirect } from "next/navigation";
import { ReportFrame } from "@/components/reports/report-frame";
import { ScheduleScreen } from "@/components/reports/schedule-screen";
import { requireUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { presentSchedules } from "@/lib/marketing/reports/p1/schedule";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function ScheduledReportsPage() {
  if (!reportsP1Enabled()) redirect("/reports");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const reader = readerFor(access);
  return (
    <ReportFrame>
      <ScheduleScreen model={presentSchedules(reader)} staff={reader === "staff"} />
    </ReportFrame>
  );
}

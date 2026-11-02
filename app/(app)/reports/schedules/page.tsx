import { redirect } from "next/navigation";
import { ReportFrame } from "@/components/reports/report-frame";
import { ScheduleScreen } from "@/components/reports/schedule-screen";
import { requireUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { p1LogStore } from "@/lib/marketing/p1-log-prisma";
import { readerFor } from "@/lib/marketing/p1-reader";
import { loadScheduleRows, presentSchedules } from "@/lib/marketing/reports/p1/schedule";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export default async function ScheduledReportsPage() {
  if (!reportsP1Enabled()) redirect("/reports");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const reader = readerFor(access);
  const rows = await loadScheduleRows(p1LogStore, WORKSPACE_ID);
  const deliveries = reader === "staff" ? await p1LogStore.listDeliveries(WORKSPACE_ID) : [];
  return (
    <ReportFrame>
      <ScheduleScreen model={presentSchedules(reader, rows)} staff={reader === "staff"} deliveries={deliveries} />
    </ReportFrame>
  );
}

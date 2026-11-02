import { notFound, redirect } from "next/navigation";
import { ReportFrame } from "@/components/reports/report-frame";
import { ChannelScreen } from "@/components/reports/channel-screen";
import { requireUser } from "@/lib/auth";
import { reportsP1Enabled } from "@/lib/marketing/config";
import { readerFor } from "@/lib/marketing/p1-reader";
import { buildChannelReport } from "@/lib/marketing/reports/p1/channel";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function ChannelReportPage({ params }: { params: Promise<{ channelId: string }> }) {
  if (!reportsP1Enabled()) redirect("/reports");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  const { channelId } = await params;
  const model = await buildChannelReport(channelId, readerFor(access));
  if (!model) notFound();
  return (
    <ReportFrame>
      <ChannelScreen model={model} />
    </ReportFrame>
  );
}

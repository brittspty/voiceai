import { RecentCalls } from "@/components/recent-calls";
import { DialsChart, Funnel, KpiRow, LiveNow, OfficeRateCard, OutcomesCard, RangeSelect } from "@/components/overview-panels";
import { PageTitle } from "@/components/shell";
import { TestModeStrip } from "@/components/test-mode-strip";
import { one, type SP } from "@/lib/params";
import { getOverview } from "@/lib/queries";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = one(sp, "range") || "today";
  const data = await getOverview(range);
  return (
    <div>
      <PageTitle title="Overview" subtitle="Calls, outcomes, and meetings booked. Avery is your AI caller." action={<RangeSelect range={range} />} />
      <TestModeStrip show={data.org.testMode} />
      <KpiRow kpis={data.kpis} />
      <div className="mt-4"><LiveNow initial={data.live} range={range} /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <DialsChart data={data.chart} range={range} />
        <OutcomesCard outcomes={data.outcomes} range={range} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <OfficeRateCard offices={data.offices} range={range} />
        <Funnel funnel={data.funnel} range={range} />
      </div>
      <RecentCalls rows={data.recent} />
    </div>
  );
}

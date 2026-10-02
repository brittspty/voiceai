import Link from "next/link";
import { ContactLines, Duration, OutcomePill } from "@/components/pills";
import { DialsChart, Funnel, KpiRow, LiveNow, OfficeRateCard, OutcomesCard, RangeSelect } from "@/components/overview-panels";
import { PageTitle } from "@/components/shell";
import { formatDateTime } from "@/lib/format";
import { one, type SP } from "@/lib/params";
import { getOverview } from "@/lib/queries";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const range = one(sp, "range") || "today";
  const data = await getOverview(range);
  return (
    <div>
      <PageTitle title="Overview" subtitle="Calls, outcomes, and meetings booked across all offices." action={<RangeSelect range={range} />} />
      <KpiRow kpis={data.kpis} />
      <div className="mt-4"><LiveNow initial={data.live} range={range} /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <DialsChart data={data.chart} />
        <OutcomesCard outcomes={data.outcomes} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <OfficeRateCard offices={data.offices} />
        <Funnel funnel={data.funnel} />
      </div>
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Recent calls</h2>
          <Link href="/calls" className="text-sm text-muted hover:text-ink">All calls</Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] tracking-wide text-muted">
                {["Time", "Contact", "Office", "Outcome", "Duration"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.recent.map((call) => (
                <tr key={call.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-muted">{formatDateTime(call.time)}</td>
                  <td className="px-4 py-3"><ContactLines name={call.contactName} phone={call.phone} direction={call.direction} /></td>
                  <td className="px-4 py-3">{call.office || "—"}</td>
                  <td className="px-4 py-3"><OutcomePill outcome={call.outcome} /></td>
                  <td className="px-4 py-3"><Duration seconds={call.durationSec} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

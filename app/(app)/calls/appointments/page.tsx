import { Suspense } from "react";
import { AppointmentsExplorer } from "@/components/other-explorers";
import { type SP } from "@/lib/params";
import { listAppointments } from "@/lib/queries";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const data = await listAppointments(await searchParams);
  return (
    <div>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {[
          ["Matching", data.kpis.matching, "across all pages"],
          ["Confirmed", data.kpis.confirmed, "on this page"],
          ["Upcoming", data.kpis.upcoming, "on this page"],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-1 text-3xl font-semibold">{value}</div>
            <div className="text-xs text-muted">{hint}</div>
          </div>
        ))}
      </div>
      <Suspense>
        <AppointmentsExplorer rows={data.rows} total={data.total} page={data.page} perPage={data.perPage} offices={data.offices} />
      </Suspense>
    </div>
  );
}

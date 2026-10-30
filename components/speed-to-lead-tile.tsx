import Link from "next/link";
import { EMPTY_LEADS, EMPTY_WAITING, ERROR_COPY, type SpeedDashboardView } from "@/lib/marketing/speed-to-lead";

export function SpeedToLeadTile({ speed }: { speed: SpeedDashboardView | { error: true } }) {
  if ("error" in speed) {
    return (
      <section className="rounded-xl border border-line bg-card p-4" aria-labelledby="speed-tile" role="alert">
        <h2 id="speed-tile" className="font-semibold">
          Speed-to-lead
        </h2>
        <p className="mt-2 text-sm">{ERROR_COPY}</p>
        <Link href="/marketing" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink underline">
          Retry
        </Link>
      </section>
    );
  }
  const noLeads = !speed.waiting.length && !speed.answeredToday.length && speed.medianSeconds == null;
  return (
    <section className="rounded-xl border border-line bg-card p-4" aria-labelledby="speed-tile">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="speed-tile" className="font-semibold">
            Speed-to-lead
          </h2>
          <p className="mt-1">{speed.headline}</p>
          <p className="mt-1 text-sm text-muted">
            {speed.withinTargetPercent == null ? "Not enough leads yet to score the target." : `${speed.withinTargetPercent}% answered within ${speed.targetSeconds}s.`}
          </p>
        </div>
        <Link href="/marketing/speed-to-lead" className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline">
          Open the waiting list
        </Link>
      </div>
      {noLeads ? (
        <p className="mt-3 text-sm text-muted">{EMPTY_LEADS}</p>
      ) : speed.waiting.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{EMPTY_WAITING}</p>
      ) : null}
      {speed.slowest.length > 0 && (
        <div className="mt-3">
          <h3 className="text-sm font-medium">Slowest leads</h3>
          <ul className="mt-2 space-y-2">
            {speed.slowest.map((lead) => (
              <li key={lead.id}>
                <Link href={`/marketing/speed-to-lead/${lead.id}`} className="flex min-h-11 flex-col justify-center rounded-lg border border-line px-3 py-2 hover:bg-hover">
                  <span className="font-medium">
                    {lead.name} · {lead.bandLabel}
                  </span>
                  <span className="sr-only">{lead.spoken}</span>
                  <span aria-hidden="true" className="text-sm text-muted">
                    {lead.line} · {lead.source}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

import Link from "next/link";

export function EmptyState({
  kind,
  channel,
  staff = false,
  connectHref = "/settings/connections/add",
}: {
  kind: "not-connected" | "no-data-yet" | "filtered-empty";
  channel?: string;
  staff?: boolean;
  connectHref?: string;
}) {
  if (kind === "filtered-empty") {
    return (
      <div className="rounded-xl border border-dashed border-line p-6">
        <h2 className="text-lg font-semibold">Nothing matches these filters</h2>
        <p className="mt-2 text-sm">
          <Link href="?" className="underline">Clear filters</Link>
        </p>
      </div>
    );
  }
  if (kind === "no-data-yet") {
    return (
      <div className="rounded-xl border border-dashed border-line p-6">
        <h2 className="text-lg font-semibold">No results yet</h2>
        <p className="mt-2 text-sm">Results show up after the first full day of data.</p>
        {staff ? (
          <p className="mt-4">
            <Link href="/settings/connections" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
              View connection
            </Link>
          </p>
        ) : null}
      </div>
    );
  }
  const name = channel || "this channel";
  const heading = name === "Meta Conversions API" ? "Connect Meta Conversions API to send conversions" : `Connect ${name} to see results here`;
  return (
    <div className="rounded-xl border border-dashed border-line p-6">
      <p className="inline-flex rounded-full border border-line px-2 py-1 text-xs">Not connected yet</p>
      <h2 className="mt-3 text-lg font-semibold">{heading}</h2>
      <p className="mt-2 text-sm">This channel is switched on, but no account is linked. Charts appear after the first sync, usually within a few hours.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={connectHref} className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm">
          {name === "Meta Conversions API" ? "Connect Meta Conversions API" : `Connect ${name}`}
        </Link>
        <Link href="/settings/connections" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
          Go to Settings › Connections
        </Link>
      </div>
      <p className="mt-3 text-xs text-muted">Clients don&apos;t see this channel until it&apos;s connected.</p>
    </div>
  );
}

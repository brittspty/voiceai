import Link from "next/link";
import { formatCount, formatMoney, DASH_DAY_OPTIONS } from "@/lib/marketing/dashboard-model";
import { realViewSearch, type RealStatus } from "@/lib/marketing/real-view";
import type { CtvChannelPage } from "@/lib/marketing/ctv/channel";

function percent(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function frequency(value: number | null) {
  if (value == null) return "—";
  return value.toFixed(1);
}

/**
 * Stored Connected TV delivery. Colors come from the Jarvis shell: black and orange.
 */
export function CtvLive({ model }: { model: CtvChannelPage }) {
  const title = model.staff ? "CTV (StackAdapt)" : "Connected TV ads";
  const href = (patch: { days?: CtvChannelPage["days"]; status?: RealStatus }) =>
    realViewSearch({
      days: patch.days ?? model.days,
      status: patch.status !== undefined ? patch.status : model.status,
      staff: model.staff,
      path: model.path,
    });
  return (
    <main>
      <nav className="ctl" aria-label="Filters">
        <div role="group" aria-label="Date range">
          {DASH_DAY_OPTIONS.map((days) => (
            <Link key={days} href={href({ days })} className={model.days === days ? "btn p" : "btn"} aria-current={model.days === days ? "page" : undefined}>
              {days} days
            </Link>
          ))}
        </div>
        <div role="group" aria-label="Status">
          <Link href={href({ status: "active" })} className={model.status === "active" ? "btn p" : "btn"} aria-current={model.status === "active" ? "page" : undefined}>Active</Link>
          <Link href={href({ status: "paused" })} className={model.status === "paused" ? "btn p" : "btn"} aria-current={model.status === "paused" ? "page" : undefined}>Paused</Link>
          <Link href={href({ status: "" })} className={model.status === "" ? "btn p" : "btn"} aria-current={model.status === "" ? "page" : undefined}>All</Link>
        </div>
      </nav>
      <div className="top">
        <div>
          <div className="sub">{model.clientName} · {title} · Connected (read only) · Last {model.days} days · Updated {model.updatedLabel}</div>
          <h1>{model.rows.length ? `${formatCount(model.totals.impressions)} impressions from ${title}.` : "No connected TV delivery in this range."}</h1>
        </div>
      </div>
      <section className="mt" aria-label="Connected TV delivery">
        <div className="m"><div className="lab">Completion rate</div><div className="v">{percent(model.totals.completionRate)}</div></div>
        <div className="m"><div className="lab">Unique impressions</div><div className="v">{formatCount(model.totals.uniqueImpressions)}</div></div>
        <div className="m"><div className="lab">Frequency</div><div className="v">{frequency(model.totals.frequency)}</div></div>
        <div className="m"><div className="lab">Video starts</div><div className="v">{formatCount(model.totals.videoStarts)}</div></div>
      </section>
      <p className="sub">{model.note} This page is read only.</p>
      {model.showMoney && model.totals.spend != null ? <p className="sub">Spend {formatMoney(model.totals.spend)}. Staff only.</p> : null}
      <h2 style={{ margin: "28px 0 8px" }}>Campaigns</h2>
      <table className="stack">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Impressions</th>
            <th>Unique impressions</th>
            <th>25%</th>
            <th>50%</th>
            <th>75%</th>
            <th>Completed</th>
            <th>Clicks through</th>
            <th>Views through</th>
            {model.showMoney ? <th>Spend</th> : null}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.id}>
              <td data-label="Campaign">{row.name}</td>
              <td data-label="Impressions">{formatCount(row.impressions)}</td>
              <td data-label="Unique impressions">{formatCount(row.uniqueImpressions)}</td>
              <td data-label="25%">{formatCount(row.completion25)}</td>
              <td data-label="50%">{formatCount(row.completion50)}</td>
              <td data-label="75%">{formatCount(row.completion75)}</td>
              <td data-label="Completed">{formatCount(row.completion100)}</td>
              <td data-label="Clicks through">{formatCount(row.clickConversions)}</td>
              <td data-label="Views through">{formatCount(row.viewConversions)}</td>
              {model.showMoney ? <td data-label="Spend">{formatMoney(row.spend ?? 0)}</td> : null}
              <td data-label="Status">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

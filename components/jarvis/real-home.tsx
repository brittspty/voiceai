import Link from "next/link";
import { formatCount, formatMoney, DASH_DAY_OPTIONS, type DashWindow } from "@/lib/marketing/dashboard-model";
import { platformFromSlug, realViewSearch, type RealHomeModel, type RealPlatform, type RealPoint, type RealStatus } from "@/lib/marketing/real-view";

export function RealEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p>{detail}</p>
    </main>
  );
}

function Filters({ model, path, includeClient }: { model: RealHomeModel; path: string; includeClient: boolean }) {
  const href = (patch: { days?: DashWindow; status?: RealStatus }) =>
    realViewSearch({
      days: patch.days ?? model.days,
      status: patch.status !== undefined ? patch.status : model.status,
      staff: model.canPickClient,
      clientId: includeClient ? model.clientId : null,
      path,
    });
  const statusHref = (status: RealStatus) => href({ status });
  return (
    <nav className="ctl" aria-label="Filters">
      <div role="group" aria-label="Date range">
        {DASH_DAY_OPTIONS.map((days) => (
          <Link key={days} href={href({ days })} className={model.days === days ? "btn p" : "btn"} aria-current={model.days === days ? "page" : undefined}>
            {days} days
          </Link>
        ))}
      </div>
      <div role="group" aria-label="Status">
        <Link href={statusHref("active")} className={model.status === "active" ? "btn p" : "btn"} aria-current={model.status === "active" ? "page" : undefined}>
          Active
        </Link>
        <Link href={statusHref("paused")} className={model.status === "paused" ? "btn p" : "btn"} aria-current={model.status === "paused" ? "page" : undefined}>
          Paused
        </Link>
        <Link href={statusHref("")} className={model.status === "" ? "btn p" : "btn"} aria-current={model.status === "" ? "page" : undefined}>
          All
        </Link>
      </div>
    </nav>
  );
}

function LeadChart({ points }: { points: RealPoint[] }) {
  if (points.length < 2) return <p className="sub">No days in this range.</p>;
  const width = 640;
  const height = 180;
  const max = Math.max(...points.map((point) => point.leads), 1);
  const coords = points.map((point, index) => {
    const x = 36 + (index / (points.length - 1)) * (width - 48);
    const y = 16 + (height - 42) - (point.leads / max) * (height - 42);
    return { ...point, x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full" role="img" aria-label="Leads over the selected dates">
      <line x1="36" y1="16" x2="36" y2={height - 26} stroke="var(--j-line)" />
      <line x1="36" y1={height - 26} x2={width - 8} y2={height - 26} stroke="var(--j-line)" />
      <text x="4" y="20" fill="var(--n3)" fontSize="11">{formatCount(max)}</text>
      <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="3" />
      {coords.filter((_, index) => points.length <= 14 || index === 0 || index === coords.length - 1).map((point) => (
        <text key={point.date} x={point.x} y={height - 8} textAnchor="middle" fill="var(--n3)" fontSize="11">{point.date.slice(5)}</text>
      ))}
    </svg>
  );
}

function channelHref(model: RealHomeModel, href: string) {
  const path = href.split("?")[0];
  return realViewSearch({ days: model.days, status: model.status, staff: model.canPickClient, path });
}

export function RealHome({ model, basePath }: { model: RealHomeModel; basePath: string }) {
  const leads = model.channels.reduce((sum, row) => sum + row.leads, 0);
  const any = model.channels.some((row) => row.connected);
  return (
    <main>
      <Filters model={model} path={basePath} includeClient={model.canPickClient} />
      <div className="top">
        <div>
          <div className="sub">{model.clientName} · Last {model.days} days · Updated {model.updatedLabel}</div>
          <h1>{any ? `${formatCount(leads)} leads in the last ${model.days} days.` : "No data yet."}</h1>
        </div>
      </div>
      <LeadChart points={model.series} />
      <table className="stack">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Campaigns</th>
            <th>Leads</th>
            <th>Clicks</th>
            {model.showMoney ? <th>Spend</th> : null}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {model.channels.map((row) => (
            <tr key={row.platform}>
              <td data-label="Channel"><Link href={channelHref(model, row.href)}>{row.label}</Link></td>
              <td data-label="Campaigns">{row.connected ? formatCount(row.inRange) : "—"}</td>
              <td data-label="Leads">{row.hasMetrics ? formatCount(row.leads) : "—"}</td>
              <td data-label="Clicks">{row.hasMetrics ? formatCount(row.clicks) : "—"}</td>
              {model.showMoney ? <td data-label="Spend">{row.connected ? formatMoney(row.spend ?? 0) : "—"}</td> : null}
              <td data-label="Status">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export function RealChannel({ model, slug, basePath }: { model: RealHomeModel; slug: string; basePath: string }) {
  const platform: RealPlatform | null = platformFromSlug(slug);
  const row = platform ? model.channels.find((item) => item.platform === platform) : null;
  const label = row?.label || "Channel";
  if (!row || !row.connected) {
    return (
      <main>
        <Filters model={model} path={basePath} includeClient={false} />
        <RealEmpty title={label} detail="Not connected yet." />
      </main>
    );
  }
  if (!row.campaigns.length) {
    return (
      <main>
        <Filters model={model} path={basePath} includeClient={false} />
        <div className="top">
          <div>
            <div className="sub">{model.clientName} · {label} · Last {model.days} days</div>
            <h1>{row.status === "No active campaigns" ? "No active campaigns." : "No data yet."}</h1>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main>
      <Filters model={model} path={basePath} includeClient={false} />
      <div className="top">
        <div>
          <div className="sub">{model.clientName} · {label} · Last {model.days} days · Updated {model.updatedLabel}</div>
          <h1>{formatCount(row.leads)} leads from {label}.</h1>
        </div>
      </div>
      <LeadChart points={row.series} />
      <table className="stack">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Status</th>
            <th>Leads</th>
            <th>Clicks</th>
            {model.showMoney ? <th>Spend</th> : null}
          </tr>
        </thead>
        <tbody>
          {row.campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td data-label="Campaign">{campaign.name}</td>
              <td data-label="Status">{campaign.status}</td>
              <td data-label="Leads">{formatCount(campaign.leads)}</td>
              <td data-label="Clicks">{formatCount(campaign.clicks)}</td>
              {model.showMoney ? <td data-label="Spend">{formatMoney(campaign.spend ?? 0)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

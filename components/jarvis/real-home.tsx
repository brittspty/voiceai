import Link from "next/link";
import { formatCount, formatMoney } from "@/lib/marketing/dashboard-model";
import { platformFromSlug, type RealHomeModel, type RealPlatform } from "@/lib/marketing/real-view";

export function RealEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p>{detail}</p>
    </main>
  );
}

export function RealHome({ model }: { model: RealHomeModel }) {
  const leads = model.channels.reduce((sum, row) => sum + row.leads, 0);
  const any = model.channels.some((row) => row.connected);
  return (
    <main>
      <div className="top">
        <div>
          <div className="sub">{model.clientName} · Last 7 days · Updated {model.updatedLabel}</div>
          <h1>{any ? `${formatCount(leads)} leads in the last 7 days.` : "No data yet."}</h1>
        </div>
      </div>
      <table className="stack">
        <thead>
          <tr>
            <th>Channel</th>
            <th>Leads</th>
            <th>Clicks</th>
            {model.showMoney ? <th>Spend</th> : null}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {model.channels.map((row) => (
            <tr key={row.platform}>
              <td><Link href={row.href}>{row.label}</Link></td>
              <td>{row.hasMetrics ? formatCount(row.leads) : "—"}</td>
              <td>{row.hasMetrics ? formatCount(row.clicks) : "—"}</td>
              {model.showMoney ? <td>{row.connected ? formatMoney(row.spend ?? 0) : "—"}</td> : null}
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export function RealChannel({ model, slug }: { model: RealHomeModel; slug: string }) {
  const platform: RealPlatform | null = platformFromSlug(slug);
  const row = platform ? model.channels.find((item) => item.platform === platform) : null;
  const label = row?.label || "Channel";
  if (!row || !row.connected) {
    return <RealEmpty title={label} detail="Not connected yet." />;
  }
  if (!row.hasMetrics) {
    return (
      <main>
        <div className="top">
          <div>
            <div className="sub">{model.clientName} · {label} · Last 7 days</div>
            <h1>No data yet.</h1>
          </div>
        </div>
        {row.campaigns.length ? (
          <ul>
            {row.campaigns.map((campaign) => (
              <li key={campaign.id}>{campaign.name}</li>
            ))}
          </ul>
        ) : null}
      </main>
    );
  }
  return (
    <main>
      <div className="top">
        <div>
          <div className="sub">{model.clientName} · {label} · Last 7 days · Updated {model.updatedLabel}</div>
          <h1>{formatCount(row.leads)} leads from {label}.</h1>
        </div>
      </div>
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
              <td>{campaign.name}</td>
              <td>{campaign.status}</td>
              <td>{formatCount(campaign.leads)}</td>
              <td>{formatCount(campaign.clicks)}</td>
              {model.showMoney ? <td>{formatMoney(campaign.spend ?? 0)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

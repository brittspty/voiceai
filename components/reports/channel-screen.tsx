import Link from "next/link";
import type { buildChannelReport } from "@/lib/marketing/reports/p1/channel";

type Model = NonNullable<Awaited<ReturnType<typeof buildChannelReport>>>;

export function ChannelScreen({ model }: { model: Model }) {
  const max = Math.max(1, ...model.points.map((point) => point.value));
  return (
    <main className="jr-wrap jr-p1">
      <p className="jr-sub">Channel report</p>
      <h1 className="jr-h1">{model.name}</h1>
      <span className="jr-ex">{model.banner}</span>
      <p className="jr-sub">{model.qualified} qualified · {model.leads} leads · {model.booked} booked</p>
      {"cpl" in model && model.cpl != null && <p className="jr-sub">CPL ${Number(model.cpl).toFixed(2)} · staff</p>}
      <section className="jr-panel" aria-label="Qualified leads">
        <div className="jr-chart" tabIndex={0} role="img" aria-label={`${model.name} qualified leads by day. ${model.tableCaption}.`} style={{ height: "auto", width: "100%" }}>
          {model.points.map((point) => (
            <div key={point.date} className="jr-legend">
              <span>{point.label}</span>
              <span aria-hidden="true" style={{ display: "inline-block", width: `${Math.round((point.value / max) * 100)}%`, minWidth: 8, height: 12, background: "var(--jr-or)" }} />
              <span>{point.value}</span>
            </div>
          ))}
        </div>
        <table className="jr-table">
          <caption className="jr-sr">{model.tableCaption}</caption>
          <thead><tr><th>Day</th><th>Qualified</th></tr></thead>
          <tbody>
            {model.points.map((point) => (
              <tr key={point.date}><td>{point.label}</td><td>{point.value}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <p><Link href="/reports">All reports</Link></p>
    </main>
  );
}

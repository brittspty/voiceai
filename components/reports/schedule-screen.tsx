import type { presentSchedules } from "@/lib/marketing/reports/p1/schedule";

const COLUMN = "Includes cost?";

export function ScheduleScreen({
  model,
  staff,
  deliveries = [],
}: {
  model: ReturnType<typeof presentSchedules>;
  staff: boolean;
  deliveries?: { at: string; scheduleId: string; audience: "staff" | "client"; moneyInCopy: "YES" | "NO"; message: "would send" }[];
}) {
  return (
    <main className="jr-wrap jr-p1">
      <p className="jr-sub">Scheduled reports · delivery is mock</p>
      <h1 className="jr-h1">Scheduled reports</h1>
      <span className="jr-ex">{model.banner}</span>
      <p className="jr-sub">Client versions are always NO. Nothing is emailed, texted, or pushed. A run logs would send.</p>
      <table className="jr-table">
        <caption className="jr-sr">Scheduled reports</caption>
        <thead>
          <tr>
            <th>Report</th>
            <th>Cadence</th>
            <th>Audience</th>
            <th>{COLUMN}</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.cadence}</td>
              <td>{row.audience === "client" ? "Client" : "Staff"}</td>
              <td>{row.audience === "client" ? "NO" : row.moneyInCopy}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {staff && <p className="jr-sub">Staff reports may include cost. Client reports stay NO even if someone asks for YES.</p>}
      {staff && deliveries.length > 0 && (
        <section aria-label="Delivery log">
          <h2>Delivery log</h2>
          <span className="jr-ex">EXAMPLE DATA</span>
          <ul>
            {deliveries.map((row, index) => (
              <li key={`${row.scheduleId}-${row.at}-${index}`}>
                {row.message} · {row.audience === "client" ? "Client" : "Staff"} · Includes cost? {row.audience === "client" ? "NO" : row.moneyInCopy}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

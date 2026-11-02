import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { compareTable, type CompareQuery, type CompareSource } from "@/lib/marketing/compare-table";
import { canSeeMoney } from "@/lib/marketing/spend-access";
import { SPEND_TOTAL_NOTE, STAFF_MONEY_MISSING_TIP } from "@/lib/marketing/staff-money";

const COLUMNS = [
  ["client", "Client"],
  ["manager", "Account manager"],
  ["spend", "Spend"],
  ["leads", "Leads"],
  ["booked", "Booked"],
  ["cpl", "CPL"],
  ["junk", "Junk-lead alert"],
  ["decisions", "Open decisions"],
] as const;

function hrefFor(query: CompareQuery, patch: Partial<CompareQuery>) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.manager) params.set("manager", next.manager);
  if (next.alerts) params.set("alerts", "1");
  if (next.decisions) params.set("decisions", "1");
  if (next.sort && next.sort !== "spend") params.set("sort", next.sort);
  if (next.dir === "asc") params.set("dir", "asc");
  const text = params.toString();
  return text ? `/marketing/compare?${text}` : "/marketing/compare";
}

export function CompareBoard({
  sources,
  query,
  showAssign,
  role,
}: {
  sources: CompareSource[];
  query: CompareQuery;
  showAssign: boolean;
  role: string;
}) {
  const showMoney = canSeeMoney(role);
  const columns = COLUMNS.filter(([key]) => showMoney || (key !== "spend" && key !== "cpl"));
  const table = compareTable(sources, query);
  const omitted = showMoney && table.rows.some((row) => row.spend == null);
  return (
    <div>
      <h1 className="text-2xl font-semibold">All clients</h1>
      <form className="mt-4 flex flex-wrap items-end gap-2 text-sm" method="get">
        <label>
          Search
          <input name="q" defaultValue={query.q || ""} aria-label="Search clients" placeholder="Search clients" className="mt-1 block h-11 rounded-lg border border-line px-3" />
        </label>
        <label>
          Account manager
          <select name="manager" defaultValue={query.manager || ""} className="mt-1 block h-11 rounded-lg border border-line bg-card px-2">
            <option value="">Any manager</option>
            {table.managers.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="alerts" value="1" defaultChecked={query.alerts} /> Has alerts
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="decisions" value="1" defaultChecked={query.decisions} /> Has open decisions
        </label>
        <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand">Filter</button>
      </form>
      {table.emptyWorkspace ? (
        <p className="mt-4 text-sm">No clients yet. Clients appear here once they&apos;re added.</p>
      ) : !table.rows.length ? (
        <div className="mt-4">
          <EmptyState kind="filtered-empty" />
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas">
                  {columns.map(([key, label]) => (
                    <th
                      key={key}
                      className="px-3 py-2 font-medium"
                      aria-sort={table.sort === key ? (table.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <Link href={hrefFor(query, { sort: key, dir: table.sort === key && table.dir === "desc" ? "asc" : "desc" })}>{label}</Link>
                    </th>
                  ))}
                  {showAssign ? <th className="px-3 py-2 font-medium">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id} className="border-b border-line">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className={`px-3 py-2 ${row.managerMissing ? "text-warning" : ""}`}>{row.manager}</td>
                    {showMoney ? <td className="px-3 py-2" title={row.spend == null ? STAFF_MONEY_MISSING_TIP : undefined}>{row.spendLabel}</td> : null}
                    <td className="px-3 py-2">{row.leads}</td>
                    <td className="px-3 py-2">{row.booked}</td>
                    {showMoney ? <td className="px-3 py-2" title={row.cpl == null ? STAFF_MONEY_MISSING_TIP : undefined}>{row.cplLabel}</td> : null}
                    <td className="px-3 py-2">{row.junkLabel}</td>
                    <td className="px-3 py-2">{row.openDecisions}</td>
                    {showAssign ? (
                      <td className="px-3 py-2">
                        {row.managerMissing ? <Link href="/settings/people">Assign manager</Link> : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 md:hidden">
            {table.rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-line p-3 text-sm">
                <h2 className="font-semibold">{row.name}</h2>
                <p className={row.managerMissing ? "text-warning" : ""}>{row.manager}</p>
                <p>{row.leads} leads</p>
                {showMoney ? <p title={row.spend == null ? STAFF_MONEY_MISSING_TIP : undefined}>{row.spendLabel}</p> : null}
              </article>
            ))}
          </div>
          {omitted ? <p className="mt-3 text-xs text-muted">{SPEND_TOTAL_NOTE}</p> : null}
          <p className="mt-3 text-sm"><a className="text-brand-ink" href="/api/marketing/compare">Download CSV</a></p>
        </>
      )}
    </div>
  );
}

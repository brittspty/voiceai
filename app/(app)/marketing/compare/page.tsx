import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compareClients } from "@/lib/marketing/compare";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

function dollars(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ flagged?: string; q?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") redirect("/marketing");
  const query = await searchParams;
  const [org, metrics, alerts, openDecisions] = await Promise.all([
    prisma.org.findUnique({ where: { id: "org" }, select: { name: true } }),
    prisma.dailyMetric.findMany({ select: { spend: true, platformConversions: true } }),
    prisma.adAlert.count({ where: { code: { in: ["ctr_without_results", "click_to_landing", "odd_hours"] } } }),
    prisma.recommendation.count({ where: { status: "verified" } }),
  ]);
  const spend = metrics.reduce((sum, row) => sum + Number(row.spend), 0);
  const booked = metrics.reduce((sum, row) => sum + Number(row.platformConversions), 0);
  const compared = compareClients({
    clients: [{ name: org?.name || "This client", manager: "Unassigned", spend, booked, junk: alerts > 0, openDecisions }],
  });
  const q = (query.q || "").trim().toLowerCase();
  const rows = compared.rows.filter((row) => {
    if (query.flagged === "1" && !row.flag) return false;
    if (q && !row.name.toLowerCase().includes(q)) return false;
    return true;
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold">All clients</h1>
      <p className="mt-1 text-sm text-muted">This database holds one client. The table is the cross-client view for super admins.</p>
      <form className="mt-4 flex flex-wrap gap-2 text-sm" method="get">
        <label>Flagged only <input type="checkbox" name="flagged" value="1" defaultChecked={query.flagged === "1"} /></label>
        <input name="q" defaultValue={query.q || ""} aria-label="Search clients" placeholder="Search clients" className="h-11 rounded-lg border border-line px-3" />
        <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-ink">Filter</button>
      </form>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-canvas p-3">Clients<b className="block text-xl">{compared.clients}</b></div>
        <div className="rounded-lg bg-canvas p-3">Booked calls<b className="block text-xl">{compared.booked}</b></div>
        <div className="rounded-lg bg-canvas p-3">Flagged<b className="block text-xl">{compared.flagged}</b></div>
        <div className="rounded-lg bg-canvas p-3">Median cost per booked call<b className="block text-xl">{compared.median ? dollars(compared.median) : "—"}</b></div>
      </div>
      {!rows.length && <p className="mt-4 text-sm">No clients match these filters. <Link href="/marketing/compare">Clear filters</Link></p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas">
              {["Flag", "Client", "Account manager", "Spend", "Booked calls", "Cost per booked call", "Open decisions"].map((header) => (
                <th key={header} className="px-3 py-2 font-medium">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-line">
                <td className="px-3 py-2">{row.flag}{row.reason ? ` · ${row.reason}` : ""}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.manager}</td>
                <td className="px-3 py-2">{dollars(row.spend)}</td>
                <td className="px-3 py-2">{row.booked}</td>
                <td className="px-3 py-2">{row.costPerBooked ? dollars(row.costPerBooked) : "—"}</td>
                <td className="px-3 py-2">{row.openDecisions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">Outlier means more than twice the median cost per booked call, and only after 500 in spend. <a className="text-brand-ink" href="/api/marketing/compare">Download CSV</a></p>
    </div>
  );
}

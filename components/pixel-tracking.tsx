import Link from "next/link";
import { syncPixelPool } from "@/lib/marketing/audiences/actions";
import type { PixelPageHealth, PoolGrowth } from "@/lib/marketing/audiences/pixel-health";

export function PixelTrackingScreen({
  pages,
  pools,
  guide,
  eventsCaptured,
  canManage,
  error,
}: {
  pages: PixelPageHealth[];
  pools: PoolGrowth[];
  guide: readonly string[];
  eventsCaptured: number;
  canManage: boolean;
  error?: string;
}) {
  return (
    <div className="grid gap-6">
      {error ? <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm" role="alert">{error}</p> : null}
      <p className="text-sm text-muted">
        {eventsCaptured} events captured. Sync to Meta, Google, and StackAdapt writes a log only. <Link className="underline" href="/marketing/audiences">Audience library</Link>
      </p>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">Fix guide</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {guide.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Page health</h2>
        {!pages.length ? <p className="text-sm">No pages yet. Add the pixel, then the page shows up here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Page</th>
                  <th className="py-2 pr-3 font-medium">Health</th>
                  <th className="py-2 font-medium">Events captured</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.pageUrl} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{page.pageName}</div>
                      <div className="text-xs text-muted">{page.pageUrl}</div>
                    </td>
                    <td className="py-2 pr-3">{page.healthLabel}</td>
                    <td className="py-2">{page.eventsCaptured}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Retargeting pools</h2>
        {!pools.length ? <p className="text-sm">No audiences yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Pool</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 pr-3 font-medium">Growth</th>
                  <th className="py-2 font-medium">Sync</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((pool) => (
                  <tr key={pool.audienceId} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{pool.name}</div>
                      <div className="text-muted">List {pool.listId}</div>
                    </td>
                    <td className="py-2 pr-3">{pool.size}</td>
                    <td className="py-2 pr-3">{pool.growthLabel}</td>
                    <td className="py-2">
                      {canManage ? (
                        <form action={syncPixelPool}>
                          <input type="hidden" name="audienceId" value={pool.audienceId} />
                          <button className="min-h-11 rounded-lg border border-line px-3" type="submit">Dry-run sync</button>
                        </form>
                      ) : "Staff sync"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

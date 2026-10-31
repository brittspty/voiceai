import Link from "next/link";
import { importAudienceCsv, decideAudienceUpload, requestAudienceUpload, saveAudienceMatch } from "@/lib/marketing/audiences/actions";
import { audienceQuery } from "@/lib/marketing/audiences/pixel";
import { AUDIENCE_PLATFORMS, PLATFORM_LABELS } from "@/lib/marketing/audiences/payloads";
import type { PresentedAudience, PresentedRow } from "@/lib/marketing/audiences/present";
import { money } from "@/lib/marketing/audiences/present";
import { AudienceUndo } from "@/components/audience-undo";

function Board({ title, rows, seesCost }: { title: string; rows: PresentedRow[]; seesCost: boolean }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {!rows.length ? <p className="text-sm text-muted">No MAID lists in this view yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">List</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium">Match</th>
                <th className="py-2 pr-3 font-medium">Verified rate</th>
                <th className="py-2 pr-3 font-medium">Lead quality</th>
                {seesCost ? <th className="py-2 pr-3 font-medium">CPL</th> : null}
                {seesCost ? <th className="py-2 pr-3 font-medium">CPA</th> : null}
                <th className="py-2 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.scope}:${row.key}`} className="border-t border-line">
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3">{row.listId}</td>
                  <td className="py-2 pr-3">{row.vendor}</td>
                  <td className="py-2 pr-3">{row.matchRateLabel}{row.dataQuality === "flagged" ? " · data quality" : ""}</td>
                  <td className="py-2 pr-3">{row.verifiedConversionRateLabel}</td>
                  <td className="py-2 pr-3">{row.leadQualityLabel}</td>
                  {seesCost ? <td className="py-2 pr-3">{money(row.cpl ?? null)}</td> : null}
                  {seesCost ? <td className="py-2 pr-3">{money(row.cpa ?? null)}</td> : null}
                  <td className="py-2">{row.holdVerdict ? row.confidence : row.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AudienceLibraryScreen({
  cards,
  leaderboard,
  pushes,
  seesCost,
  canManage,
  error,
}: {
  cards: PresentedAudience[];
  leaderboard: { lists: PresentedRow[]; vendors: PresentedRow[]; subsegments: PresentedRow[] };
  pushes: { id: string; name: string; platform: string; status: string; listId: string; vendor: string; undoUntil: string | null; manualSteps: string[]; logLine: string }[];
  seesCost: boolean;
  canManage: boolean;
  error?: string;
}) {
  return (
    <div className="grid gap-6">
      {error ? <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm" role="alert">{error}</p> : null}
      <p className="text-sm text-muted">
        Each list is a data-market MAID audience. A push stays a dry run. <Link className="underline" href="/marketing/audiences/pixel">Pixel tracking</Link>
      </p>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Library</h2>
        {!cards.length ? <p className="text-sm">No MAID audiences yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">List</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Vendor</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 pr-3 font-medium">Freshness</th>
                  <th className="py-2 pr-3 font-medium">Match rate</th>
                  <th className="py-2 font-medium">Push</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{card.name}</div>
                      <div className="text-muted">List {card.listId}</div>
                      <div className="mt-1 font-mono text-xs text-muted">{audienceQuery(card.id, card.listId)}</div>
                    </td>
                    <td className="py-2 pr-3">{card.sourceLabel}</td>
                    <td className="py-2 pr-3">{card.vendor}</td>
                    <td className="py-2 pr-3">{card.size}</td>
                    <td className="py-2 pr-3">{card.freshnessLabel}</td>
                    <td className="py-2 pr-3">
                      {card.platforms.length ? card.platforms.map((platform) => (
                        <div key={platform.platform}>
                          {platform.label}: {platform.matchRateLabel}
                          {platform.dataQuality === "flagged" ? " · data quality" : ""}
                        </div>
                      )) : "No match report"}
                    </td>
                    <td className="py-2">
                      {card.pushStatus.length ? card.pushStatus.map((push) => (
                        <div key={push.id}>
                          <div>{push.label}: {push.statusLabel}</div>
                          {push.undoUntil ? <AudienceUndo undoUntil={push.undoUntil} pushId={push.id} /> : null}
                          {push.statusLabel === "Waiting for Yes" && canManage ? (
                            <form action={decideAudienceUpload} className="mt-2 flex gap-2">
                              <input type="hidden" name="pushId" value={push.id} />
                              <button name="decision" value="yes" className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Yes</button>
                              <button name="decision" value="no" className="min-h-11 rounded-lg border border-line px-4" type="submit">No</button>
                            </form>
                          ) : null}
                        </div>
                      )) : "No push"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {canManage ? (
        <form action={importAudienceCsv} className="grid gap-3 rounded-xl border border-line bg-card p-4">
          <h2 className="text-base font-semibold">Import a MAID list</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">Name<input name="name" required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Vendor<input name="vendor" required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">List id<input name="listId" required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Consent basis<input name="consentBasis" required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Acquired<input name="acquisitionDate" type="date" required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Refresh
              <select name="refreshCadence" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" defaultValue="monthly">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="daily">Daily</option>
              </select>
            </label>
            {seesCost ? <label className="text-sm font-medium">Cost<input name="cost" inputMode="decimal" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label> : null}
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm font-medium">Intent<input name="intent" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Geo<input name="geo" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Demographics<input name="demographics" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Behavior<input name="behavior" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
          </div>
          <label className="text-sm font-medium">CSV
            <textarea name="csv" required rows={4} className="mt-1 w-full rounded-lg border border-line bg-card p-2 font-mono text-sm" placeholder="maid,id_type" />
          </label>
          <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Import list</button>
        </form>
      ) : null}
      {canManage && cards.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          <form action={saveAudienceMatch} className="grid gap-3 rounded-xl border border-line bg-card p-4">
            <h2 className="text-base font-semibold">Match report</h2>
            <label className="text-sm font-medium">Audience
              <select name="audienceId" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2">
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Platform
              <select name="platform" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2">
                {AUDIENCE_PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABELS[platform]}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Uploaded<input name="uploaded" type="number" min={0} required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Matched<input name="matched" type="number" min={0} required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            <label className="text-sm font-medium">Reach<input name="reach" type="number" min={0} required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
            {seesCost ? <label className="text-sm font-medium">Spend<input name="spend" inputMode="decimal" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label> : null}
            <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Save match report</button>
          </form>
          <form action={requestAudienceUpload} className="grid gap-3 rounded-xl border border-line bg-card p-4">
            <h2 className="text-base font-semibold">Request a push</h2>
            <p className="text-sm text-muted">This opens a Yes or No. Yes can be undone for 30 seconds. The push stays a dry run.</p>
            <label className="text-sm font-medium">Audience
              <select name="audienceId" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2">
                {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Platform
              <select name="platform" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2">
                {AUDIENCE_PLATFORMS.map((platform) => <option key={platform} value={platform}>{PLATFORM_LABELS[platform]}</option>)}
              </select>
            </label>
            <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Create decision</button>
          </form>
        </div>
      ) : null}
      {pushes.some((push) => push.logLine || push.manualSteps.length) ? (
        <section className="grid gap-3">
          <h2 className="text-base font-semibold">Dry-run logs</h2>
          {pushes.filter((push) => push.logLine || push.manualSteps.length).map((push) => (
            <article key={push.id} className="rounded-xl border border-line bg-card p-4 text-sm">
              <div className="font-medium">{push.name} · {PLATFORM_LABELS[push.platform as keyof typeof PLATFORM_LABELS] || push.platform}</div>
              <div className="text-muted">List {push.listId} from {push.vendor}</div>
              {push.logLine ? <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-canvas p-3 text-xs">{push.logLine}</pre> : null}
              {push.manualSteps.length ? <ol className="mt-3 list-decimal pl-5">{push.manualSteps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
            </article>
          ))}
        </section>
      ) : null}
      <Board title="MAID lists" rows={leaderboard.lists} seesCost={seesCost} />
      <Board title="Vendors" rows={leaderboard.vendors} seesCost={seesCost} />
      <Board title="Sub-segments" rows={leaderboard.subsegments} seesCost={seesCost} />
    </div>
  );
}

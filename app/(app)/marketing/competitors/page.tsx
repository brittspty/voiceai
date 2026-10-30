import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { competitorWatchEnabled } from "@/lib/marketing/config";
import { addCompetitorAction, draftCompetitorIdeaAction, refreshCompetitorsAction, removeCompetitorAction } from "@/lib/marketing/feature-actions";
import { canWatchCompetitors } from "@/lib/marketing/feature-access";
import { cardsForCompetitors, listCompetitors } from "@/lib/marketing/competitor-store";
import { MAX_COMPETITORS, competitorWeeklySummary } from "@/lib/marketing/competitor-watch";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ error?: string; filter?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!competitorWatchEnabled()) {
    return (
      <div>
        <PageTitle title="Competitor ads" subtitle="Competitor watch is turned off." />
      </div>
    );
  }
  if (!canWatchCompetitors(access)) return <NoAccess title="Competitor ads" />;
  const query = await searchParams;
  const competitors = await listCompetitors(access.workspaceId);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const summary = competitorWeeklySummary(competitors.map((competitor) => ({
    name: competitor.name,
    ads: competitor.ads.map((ad) => ({ firstSeen: ad.firstSeen.toISOString().slice(0, 10), headline: ad.headline })),
  })), since);
  let cards = cardsForCompetitors(competitors);
  if (query.filter === "new") cards = cards.filter((card) => card.isNew);
  if (query.filter === "long") cards = cards.filter((card) => card.longRunning);
  return (
    <div>
      <PageTitle title="Competitor ads" subtitle="Public ads from the Meta Ad Library. This does not show a competitor's spend or results." />
      {query.error ? <p className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm" role="alert">{query.error}</p> : null}
      {summary.length ? <p className="mb-4 text-sm">{summary.join(" ")}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <a className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm" href="/marketing/competitors">All</a>
        <a className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm" href="/marketing/competitors?filter=new">New this week</a>
        <a className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm" href="/marketing/competitors?filter=long">Long-running</a>
      </div>
      {!competitors.length ? (
        <p className="mb-4 rounded-xl border border-line bg-card p-6 text-sm">Add up to {MAX_COMPETITORS} competitors to watch.</p>
      ) : null}
      {competitors.length < MAX_COMPETITORS ? (
        <form action={addCompetitorAction} className="mb-6 grid gap-3 rounded-xl border border-line bg-card p-4">
          <label className="text-sm font-medium">Business name<input name="name" required className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
          <label className="text-sm font-medium">Facebook page id<input name="pageId" inputMode="numeric" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
          <label className="text-sm font-medium">Website<input name="website" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" /></label>
          <label className="text-sm font-medium">Search words<input name="searchTerms" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" placeholder="same-day service" /></label>
          <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Add competitor</button>
        </form>
      ) : null}
      {competitors.length ? (
        <form action={refreshCompetitorsAction} className="mb-6">
          <button className="min-h-11 rounded-lg border border-line bg-card px-4 font-semibold text-ink" type="submit">Refresh from Meta Ad Library</button>
        </form>
      ) : null}
      <div className="space-y-3">
        {competitors.map((competitor) => competitor.lastError ? <p key={competitor.id} className="text-sm" role="alert">{competitor.lastError} <span className="text-muted">Edit the page id if it is private.</span></p> : null)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <article key={card.id} className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-semibold">{card.headline}</h2>
            <p className="mt-1 text-sm text-muted">{card.competitorName} · {card.runningSince} · {card.active ? "Active" : "Inactive"}</p>
            {card.body ? <p className="mt-2 text-sm">{card.body}</p> : null}
            <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink" href={card.snapshotUrl} target="_blank" rel="noreferrer">View in Meta Ad Library</a>
            <form action={draftCompetitorIdeaAction} className="mt-2">
              <input type="hidden" name="adId" value={card.id} />
              <button className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold" type="submit">Make a version like this</button>
            </form>
          </article>
        ))}
      </div>
      <ul className="mt-6 space-y-2">
        {competitors.map((competitor) => (
          <li key={competitor.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{competitor.name}</span>
            <form action={removeCompetitorAction}>
              <input type="hidden" name="id" value={competitor.id} />
              <button className="min-h-11 rounded-lg px-3" type="submit">Remove</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

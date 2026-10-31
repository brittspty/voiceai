import { decideMarketingRecommendation } from "@/lib/marketing/human-actions";
import { amRealtimeEnabled } from "@/lib/marketing/config";
import { loadFeedForAccess } from "@/lib/marketing/feed-job";
import type { MarketingAccess } from "@/lib/marketing/access";
import { prisma } from "@/lib/db";
import { AmFeedRefresh } from "@/components/am-feed-refresh";

function recommendationId(sourceId: string) {
  return sourceId.startsWith("fatigue:") ? sourceId.slice("fatigue:".length) : "";
}

export async function AmFeed({ access }: { access: MarketingAccess }) {
  if (!amRealtimeEnabled()) return null;
  if (access.kind !== "super_admin" && access.kind !== "account_manager") return null;
  const assignments = access.kind === "account_manager"
    ? (await prisma.marketingAssignment.findMany({ where: { userId: access.userId } })).map((row) => ({
        workspaceId: row.workspaceId,
        scopeKind: row.scopeKind,
        adAccountId: row.adAccountId,
        campaignId: row.campaignId,
      }))
    : [];
  const events = await loadFeedForAccess({ kind: access.kind, assignments, limit: 12 });
  return (
    <section className="mb-6" aria-live="polite">
      <AmFeedRefresh latestId={events[0]?.id || ""} />
      <h2 className="mb-1 font-semibold">Live updates</h2>
      <p className="mb-3 text-sm text-muted">Your campaigns, as they change. The hourly summary is still the recap.</p>
      {!events.length && <p className="text-sm text-muted">Nothing new yet.</p>}
      <div className="space-y-3">
        {events.map((event) => {
          const recId = recommendationId(event.sourceId);
          const fatigue = event.kind === "fatigue_decision" && (event.decision === "pause" || event.decision === "rotate");
          return (
            <article key={event.id} className="rounded-xl border border-line bg-card p-4">
              <p className="text-xs font-bold uppercase text-muted">{event.kind === "fatigue_decision" ? "Yes or no" : event.kind === "opportunity" ? "Opportunity" : event.kind === "anomaly" ? "Check this" : "What changed"}</p>
              <h3 className="mt-1 font-semibold">{event.title}</h3>
              <p className="mt-1 text-sm">{event.body}</p>
              {event.reason && event.reason !== event.body && <p className="mt-1 text-sm text-muted">{event.reason}</p>}
              {fatigue && recId && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={recId} />
                    <input type="hidden" name="decision" value={event.decision === "pause" ? "pause" : "accept"} />
                    <button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-on-brand">Yes</button>
                  </form>
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={recId} />
                    <input type="hidden" name="decision" value="decline" />
                    <input type="hidden" name="reason" value="no" />
                    <button className="min-h-11 rounded-lg border border-line bg-card px-5 font-semibold">No</button>
                  </form>
                  <p className="w-full text-sm text-muted">
                    {event.decision === "pause"
                      ? "Yes records a pause. The ad account does not change from here."
                      : "Yes queues a new version for a person to upload. Nothing goes live on its own."}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

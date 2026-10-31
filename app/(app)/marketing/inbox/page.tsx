import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { inboxEnabled } from "@/lib/marketing/config";
import { decideMarketingRecommendation, decideSkillOffer } from "@/lib/marketing/human-actions";
import { markNotificationRead } from "@/lib/marketing/inbox-actions";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

function payloadOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as { recommendationId?: string; decision?: string; pending?: boolean; skill?: string };
}

export default async function InboxPage() {
  if (!inboxEnabled()) notFound();
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "none" || access.kind === "client_viewer" || access.kind === "all_clients_viewer") return <NoAccess title="Inbox" />;
  const rows = await prisma.staffNotification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <p className="mt-1 text-sm text-muted">Hourly summaries, live campaign notes, and skill offers for you.</p>
      {!rows.length && <p className="mt-4 text-sm text-muted">Nothing is waiting.</p>}
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const payload = payloadOf(row.payload);
          const fatigue = row.kind === "fatigue_decision" && payload.recommendationId && (payload.decision === "pause" || payload.decision === "rotate");
          const skill = row.kind === "skill_offer" && access.kind === "super_admin";
          return (
            <article key={row.id} className="rounded-xl border border-line bg-card p-4">
              <p className="text-xs text-muted">{formatDateTime(row.createdAt)}{row.readAt ? "" : " · Unread"}</p>
              <h2 className="mt-1 font-semibold">{row.title}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{row.body}</p>
              {row.href && <p className="mt-2 text-sm"><Link className="text-brand-ink" href={row.href}>Open</Link></p>}
              {fatigue && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={payload.recommendationId} />
                    <input type="hidden" name="decision" value={payload.decision === "pause" ? "pause" : "accept"} />
                    <button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-on-brand">Yes</button>
                  </form>
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={payload.recommendationId} />
                    <input type="hidden" name="decision" value="decline" />
                    <input type="hidden" name="reason" value="no" />
                    <button className="min-h-11 rounded-lg border border-line bg-card px-5 font-semibold">No</button>
                  </form>
                </div>
              )}
              {skill && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={decideSkillOffer}>
                    <input type="hidden" name="choice" value="yes" />
                    <button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-on-brand">Yes, add skill</button>
                  </form>
                  <form action={decideSkillOffer}>
                    <input type="hidden" name="choice" value="no" />
                    <button className="min-h-11 rounded-lg border border-line bg-card px-5 font-semibold">No, skip it</button>
                  </form>
                </div>
              )}
              {!row.readAt && (
                <form action={markNotificationRead} className="mt-3">
                  <input type="hidden" name="id" value={row.id} />
                  <button className="text-sm text-brand-ink">Mark read</button>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

import { decideMarketingRecommendation } from "@/lib/marketing/human-actions";
import {
  budgetCardCopy,
  budgetNeedsSuperAdmin,
  canApproveCard,
  cardExpiry,
  confidenceLabel,
  expiryLabel,
  type DecisionInput,
} from "@/lib/marketing/decision-ui";

function Button({ children, primary = false, label }: { children: React.ReactNode; primary?: boolean; label: string }) {
  return (
    <button aria-label={label} className={`min-h-11 rounded-lg px-5 text-base font-semibold ${primary ? "bg-brand text-ink" : "border border-line bg-card text-ink"}`}>
      {children}
    </button>
  );
}

export function DecisionQueue({
  cards,
  canAct,
  isSuperAdmin = false,
  budgetCap = 500,
}: {
  cards: DecisionInput[];
  canAct: boolean;
  isSuperAdmin?: boolean;
  budgetCap?: number;
}) {
  const now = new Date();
  const waiting = cards.filter((card) => card.status === "verified" && canApproveCard(card, now));
  return (
    <section>
      <h2 className="mb-1 font-semibold">Decisions</h2>
      <p className="mb-3 text-sm text-muted">{waiting.length ? `${waiting.length} waiting for you` : "You're all caught up. New decisions show up here and in your hourly summary."}</p>
      <div className="space-y-4">
        {cards.map((card) => {
          const expiry = cardExpiry(card, now);
          const budget = card.type === "budget_change" ? budgetCardCopy(card) : null;
          const approved = card.status === "accepted";
          const waitingPerson = approved && budget && card.decisionNote !== "done";
          const needsAdmin = Boolean(budget) && !isSuperAdmin && budgetNeedsSuperAdmin(card.proposedBudgetAmount, budgetCap);
          const undoOpen = approved && card.decidedAt && now.getTime() - Date.parse(card.decidedAt) < 30_000;
          const canApprove = canAct && canApproveCard(card, now) && !needsAdmin;
          return (
            <article key={card.id} className="rounded-xl border border-line bg-card p-4" aria-labelledby={`decision-${card.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="rounded-md border border-line bg-chip px-2 py-0.5 text-xs font-bold text-ink">{budget ? budget.tag : card.type === "traffic" ? "Urgent · Check traffic" : "Suggestion"}</span>
                <span>{needsAdmin ? "Needs a super admin's OK" : expiry.expired ? "Expired" : card.status === "declined" ? "Declined" : approved ? "Approved" : "Pending"}</span>
                <span>{expiryLabel(expiry.ends, now.getTime())}</span>
              </div>
              <h3 id={`decision-${card.id}`} className="mt-2 text-lg font-semibold">{budget ? budget.headline : card.title}</h3>
              <p className="mt-1">{budget ? budget.why : card.summary}</p>
              {budget && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-canvas p-3">
                    <span className="text-sm text-muted">Current budget</span>
                    <b className="block text-xl">{budget.current}</b>
                    <span className="text-sm text-muted">{budget.setBy}</span>
                  </div>
                  <div className="rounded-lg bg-canvas p-3">
                    <span className="text-sm text-muted">Recommended</span>
                    <b className="block text-xl">{budget.recommended}</b>
                    <span className="text-sm text-muted">{budget.change}</span>
                  </div>
                </div>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-canvas p-3 text-sm">Confidence<b className="block text-xl">{confidenceLabel(card.sampleSize)}</b></div>
                <div className="rounded-lg bg-canvas p-3 text-sm">Window<b className="block text-xl">{card.windowStart || "—"} to {card.windowEnd || "—"}</b></div>
              </div>
              <details className="mt-3 text-sm">
                <summary>Show evidence</summary>
                <p className="mt-2 text-muted">
                  {card.metric} moved from {card.baseline} to {card.observed}. {card.sourceCount} source rows. {card.verifierNote || "A second check confirmed this."}
                </p>
              </details>
              {budget && <p className="mt-3 text-sm text-muted">{budget.fixed}</p>}
              {needsAdmin && <p className="mt-3 text-sm">Needs a super admin&apos;s OK</p>}
              {waitingPerson && (
                <div className="mt-3 rounded-lg bg-success-soft p-3 text-sm">
                  <b>Approved by you. The budget has not changed yet.</b>
                  <ol className="mt-2 list-decimal pl-5">
                    <li>Open the ad account and find this campaign.</li>
                    <li>Set the budget to the recommended amount yourself.</li>
                    <li>Come back and tap “I made the change.”</li>
                  </ol>
                </div>
              )}
              {canApprove && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="decision" value="accept" />
                    <Button primary label={budget ? `Approve and get steps: ${card.title}` : `Approve: ${card.title}`}>{budget ? "Approve and get steps" : "Approve"}</Button>
                  </form>
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="decision" value="decline" />
                    <Button label={`Decline: ${card.title}`}>Decline</Button>
                  </form>
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="decision" value="later" />
                    <Button label={`Later: ${card.title}`}>Later</Button>
                  </form>
                </div>
              )}
              {canAct && waitingPerson && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="decision" value="confirm" />
                    <Button primary label={`I made the change: ${card.title}`}>I made the change</Button>
                  </form>
                  <form action={decideMarketingRecommendation}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="decision" value="assign" />
                    <Button label={`Assign to a teammate: ${card.title}`}>Assign to a teammate</Button>
                  </form>
                  {undoOpen && (
                    <form action={decideMarketingRecommendation}>
                      <input type="hidden" name="id" value={card.id} />
                      <input type="hidden" name="decision" value="undo" />
                      <Button label={`Undo: ${card.title}`}>Undo</Button>
                    </form>
                  )}
                </div>
              )}
              {expiry.expired && card.status === "verified" && <p className="mt-3 text-sm">No answer in 24h. Nothing was changed.</p>}
              {card.status === "declined" && <p className="mt-3 text-sm text-muted">{card.decisionNote || "Declined"}</p>}
              {!canAct && !needsAdmin && card.status === "verified" && !expiry.expired && <p className="mt-3 text-sm">Waiting for a super admin</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

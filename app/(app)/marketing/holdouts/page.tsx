import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { holdoutsEnabled } from "@/lib/marketing/config";
import { computeHoldoutAction, createHoldoutAction, recordLiftAction, startHoldoutAction, undoHoldoutAction } from "@/lib/marketing/feature-actions";
import { campaignAllowed, canViewHoldouts } from "@/lib/marketing/feature-access";
import { listCampaignChoices, listHoldoutTests } from "@/lib/marketing/holdout-store";
import { HOLDOUT_QUESTION, canDesignHoldout, canStartHoldout, canUndoHoldoutStart, holdoutProgress, viewStoredLift, type LiftVerdict } from "@/lib/marketing/holdouts";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

function num(value: { toString(): string } | null) {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function HoldoutsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!holdoutsEnabled()) {
    return (
      <div>
        <PageTitle title="Holdout tests" subtitle="Holdout tests are turned off." />
      </div>
    );
  }
  if (!canViewHoldouts(access)) return <NoAccess title="Holdout tests" />;
  const query = await searchParams;
  const [tests, campaigns] = await Promise.all([listHoldoutTests(access), listCampaignChoices(access.workspaceId)]);
  const choices = campaigns.filter((campaign) => campaignAllowed(access, campaign));
  const canDesign = canDesignHoldout(access);
  const canStart = canStartHoldout(access);
  return (
    <div>
      <PageTitle
        title="Holdout tests"
        subtitle="Design a test, assign who is held out, and read the lift. People set the holdout in Ads Manager. This app does not change ads or budgets."
      />
      {query.error ? <p className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm" role="alert">{query.error}</p> : null}
      {!tests.length ? <p className="mb-4 rounded-xl border border-line bg-card p-6 text-sm">No tests yet. A test shows whether ads truly add leads.</p> : null}
      {canDesign ? (
        <form action={createHoldoutAction} className="mb-8 grid gap-4 rounded-xl border border-line bg-card p-4">
          <fieldset className="grid gap-2">
            <legend className="font-semibold">What do you want to know?</legend>
            <label className="text-sm">Question
              <input name="question" required defaultValue={HOLDOUT_QUESTION} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" />
            </label>
            <label className="text-sm">Count
              <select name="metric" className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2">
                <option value="leads">Leads</option>
                <option value="bookings">Bookings</option>
                <option value="conversions">Conversions</option>
              </select>
            </label>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="font-semibold">Who is held out?</legend>
            <label className="text-sm">Test type
              <select name="kind" className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2">
                <option value="geo">Area</option>
                <option value="audience">Audience</option>
                <option value="time">Time window</option>
              </select>
            </label>
            <label className="text-sm">Holdout percent
              <input name="holdoutPercent" type="number" min={1} max={50} defaultValue={10} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" />
              <span className="mt-1 block text-muted">10% of people won&apos;t see ads for the length of the test.</span>
            </label>
            <label className="text-sm">Areas, audiences, or dates
              <textarea name="units" required rows={3} className="mt-1 w-full rounded-lg border border-line bg-card p-2" placeholder="One per line" />
            </label>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="font-semibold">Review</legend>
            <label className="text-sm">Campaign
              <select name="campaignId" required className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2">
                {choices.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">Start<input name="startDate" type="date" required className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" /></label>
              <label className="text-sm">End<input name="endDate" type="date" required className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" /></label>
            </div>
            <label className="text-sm">Minimum leads before a result
              <input name="minSample" type="number" min={1} defaultValue={30} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" />
            </label>
          </fieldset>
          <button className="min-h-12 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Save test design</button>
        </form>
      ) : null}
      <div className="space-y-4">
        {tests.map((test) => {
          const latest = test.results[0];
          const readout = latest
            ? viewStoredLift({
                ready: latest.ready,
                verdict: latest.verdict as LiftVerdict,
                method: latest.method,
                sentence: latest.sentence,
                extraLeads: num(latest.extraLeads),
                rangeLow: num(latest.rangeLow),
                rangeHigh: num(latest.rangeHigh),
                confidence: num(latest.confidence),
                extraLeadCost: num(latest.extraLeadCost),
              }, access.seesCost)
            : null;
          const progress = holdoutProgress(test.startDate.toISOString().slice(0, 10), test.endDate.toISOString().slice(0, 10));
          const undo = canUndoHoldoutStart(test.status, test.startedAt);
          return (
            <article key={test.id} className="rounded-xl border border-line bg-card p-4">
              <p className="text-xs font-bold uppercase text-muted">{test.status.replaceAll("_", " ")} · {test.campaign.name}</p>
              <h2 className="mt-1 text-lg font-semibold">{test.question}</h2>
              {test.status === "running" || test.status === "completed" ? <p className="mt-2 text-sm">{progress.label}</p> : null}
              {readout ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold">{readout.verdictLabel}</p>
                  <p className="mt-1">{readout.sentence}</p>
                  {access.seesCost && readout.staffCostLine ? <p className="mt-1 text-sm">{readout.staffCostLine} <span className="text-muted">Staff only</span></p> : null}
                  <label className="mt-3 block text-sm">What the client sees
                    <textarea readOnly className="mt-1 w-full rounded-lg border border-line bg-canvas p-2" value={readout.sentence} />
                  </label>
                </div>
              ) : <p className="mt-2 text-sm text-muted">Too early to tell until the readout is calculated.</p>}
              <p className="mt-3 text-sm text-muted">Holdout: {test.assignments.filter((row) => row.role === "holdout").map((row) => row.unitKey).join(", ") || "None"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canStart && test.status === "draft" ? (
                  <form action={startHoldoutAction}>
                    <input type="hidden" name="testId" value={test.id} />
                    <button className="min-h-12 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Start test</button>
                  </form>
                ) : null}
                {canStart && undo ? (
                  <form action={undoHoldoutAction}>
                    <input type="hidden" name="testId" value={test.id} />
                    <button className="min-h-12 rounded-lg border border-line px-4 font-semibold" type="submit">Undo</button>
                  </form>
                ) : null}
                {canDesign ? (
                  <form action={computeHoldoutAction}>
                    <input type="hidden" name="testId" value={test.id} />
                    <button className="min-h-12 rounded-lg border border-line px-4 font-semibold" type="submit">Calculate result</button>
                  </form>
                ) : null}
              </div>
              {canDesign ? (
                <form action={recordLiftAction} className="mt-4 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="testId" value={test.id} />
                  <label className="text-sm">Area or date
                    <select name="unitKey" className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2">
                      {test.assignments.map((assignment) => <option key={assignment.id} value={assignment.unitKey}>{assignment.unitKey} ({assignment.role})</option>)}
                    </select>
                  </label>
                  <label className="text-sm">Period
                    <select name="period" className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2">
                      <option value="post">During the test</option>
                      <option value="pre">Before the test</option>
                    </select>
                  </label>
                  <label className="text-sm">Leads<input name="outcome" type="number" min={0} step="1" defaultValue={0} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" /></label>
                  <label className="text-sm">Ad views in this group<input name="impressions" type="number" min={0} step="1" defaultValue={0} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" /></label>
                  {access.seesCost ? <label className="text-sm">Spend<input name="spend" type="number" min={0} step="0.01" defaultValue={0} className="mt-1 min-h-12 w-full rounded-lg border border-line bg-card px-2" /></label> : null}
                  <button className="min-h-12 rounded-lg border border-line px-4 font-semibold" type="submit">Save counts</button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

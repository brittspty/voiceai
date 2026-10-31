import { notFound } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { prisma } from "@/lib/db";
import { DEMO_WORKSPACE_ID } from "@/lib/demo/isolation";
import { approvePlanAction, previewPlan, revokePlanAction, savePlan } from "@/lib/plans/actions";
import { clientPlansEnabled } from "@/lib/plans/flags";
import { PLAN_CHANNELS, PLAN_CONTACT_HREF, PLAN_START_LABEL, canEditPlans, planLinkDays, sharePath } from "@/lib/plans/plan";
import { planRecord } from "@/lib/plans/store";

export default async function PlanEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!clientPlansEnabled()) notFound();
  const user = await requireUser();
  if (!canEditPlans(user.role)) denyAccess();
  const { id } = await params;
  const row = await prisma.clientPlan.findUnique({ where: { id }, include: { views: { orderBy: { viewedAt: "desc" }, take: 20 }, approvedBy: { select: { name: true } } } });
  if (!row) notFound();
  const plan = planRecord(row);
  const issuedRaw = (await searchParams).issued;
  const issued = typeof issuedRaw === "string" ? issuedRaw : "";
  const shared = issued ? sharePath(plan, issued) : null;
  const workspaces = await prisma.workspace.findMany({ where: { id: { not: DEMO_WORKSPACE_ID } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageTitle title={plan.clientName} subtitle="Super admins and account managers edit this plan. Visitors stay anonymous." />
      {plan.approvedAt ? <p className="mb-4 text-sm">Approved by {row.approvedBy?.name || "a teammate"} on {new Date(plan.approvedAt).toLocaleString("en-US")}.</p> : null}
      {shared ? <p className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm">Share link: <a className="font-semibold underline" href={shared}>{shared}</a></p> : null}
      {!shared && plan.status !== "approved" ? <p className="mb-4 text-sm text-muted">No shareable link before approval.</p> : null}
      <form action={savePlan} className="space-y-4">
        <input type="hidden" name="id" value={plan.id} />
        <label className="block text-sm font-medium">Client name
          <input name="clientName" defaultValue={plan.clientName} required className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3" />
        </label>
        <label className="block text-sm font-medium">Logo (PNG, JPG, or SVG)
          <input name="logo" type="file" accept="image/png,image/jpeg,image/svg+xml" className="mt-1 block text-sm" />
        </label>
        <label className="block text-sm font-medium">Goals
          <textarea name="goals" defaultValue={plan.goals} rows={4} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Channels we will run</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {PLAN_CHANNELS.map((channel) => (
              <label key={channel} className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="channels" value={channel} defaultChecked={plan.channels.includes(channel)} />
                {channel}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">Audiences to test
          <textarea name="audiences" defaultValue={plan.audiences.join("\n")} rows={4} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" placeholder="One audience per line" />
        </label>
        <label className="block text-sm font-medium">Segments to test
          <textarea name="segments" defaultValue={plan.segments.join("\n")} rows={4} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" placeholder="One segment per line" />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Sample dashboard</legend>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="dashboardSource" value="demo" defaultChecked={plan.dashboardSource === "demo"} /> Demo seed</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="dashboardSource" value="baseline" defaultChecked={plan.dashboardSource === "baseline"} /> This client baseline</label>
          <select name="baselineWorkspaceId" defaultValue={plan.baselineWorkspaceId} className="mt-2 h-11 w-full rounded-lg border border-line bg-card px-3">
            <option value="">Choose a workspace</option>
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </fieldset>
        <label className="block text-sm font-medium">Timeline
          <textarea name="timeline" defaultValue={plan.timeline} rows={3} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">What they will see each week
          <textarea name="weekly" defaultValue={plan.weekly} rows={3} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">Start label
          <input name="ctaLabel" defaultValue={plan.ctaLabel || PLAN_START_LABEL} className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3" />
        </label>
        <label className="block text-sm font-medium">Start link
          <input name="ctaHref" defaultValue={plan.ctaHref || PLAN_CONTACT_HREF} className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3" />
        </label>
        <label className="block text-sm font-medium">Link expires in days
          <input name="linkDays" type="number" min={1} max={365} defaultValue={plan.linkDays || planLinkDays()} className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="showCost" defaultChecked={plan.showCost} /> Show ROAS, spend, and cost</label>
        <button className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" type="submit">Save</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {plan.status === "draft" ? (
          <form action={previewPlan}><input type="hidden" name="id" value={plan.id} /><button className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold" type="submit">Staff preview</button></form>
        ) : null}
        {plan.status === "preview" ? (
          <form action={approvePlanAction}><input type="hidden" name="id" value={plan.id} /><button className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" type="submit">Approve and create link</button></form>
        ) : null}
        {plan.status === "approved" && !plan.revokedAt ? (
          <form action={revokePlanAction}><input type="hidden" name="id" value={plan.id} /><button className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold" type="submit">Revoke link</button></form>
        ) : null}
      </div>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Views</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {row.views.map((view) => <li key={view.id}>{view.viewedAt.toLocaleString("en-US")} · {view.userAgentCoarse}</li>)}
          {row.views.length === 0 ? <li>No views yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}

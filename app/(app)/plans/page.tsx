import { notFound } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { prisma } from "@/lib/db";
import { createPlan } from "@/lib/plans/actions";
import { clientPlansEnabled } from "@/lib/plans/flags";
import { canEditPlans } from "@/lib/plans/plan";

export default async function PlansPage() {
  if (!clientPlansEnabled()) notFound();
  const user = await requireUser();
  if (!canEditPlans(user.role)) denyAccess();
  const plans = await prisma.clientPlan.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, clientName: true, status: true, approvedAt: true } });
  return (
    <div>
      <PageTitle title="Client plans" subtitle="Draft, preview, then approve. A share link exists only after approval." />
      <form action={createPlan} className="mb-6 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">
          Client name
          <input name="clientName" required className="mt-1 block h-11 rounded-lg border border-line bg-card px-3" />
        </label>
        <button className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" type="submit">New plan</button>
      </form>
      <ul className="space-y-2">
        {plans.map((plan) => (
          <li key={plan.id}>
            <a className="block rounded-xl border border-line bg-card px-4 py-3" href={`/plans/${plan.id}`}>
              <span className="font-semibold">{plan.clientName}</span>
              <span className="ml-2 text-sm text-muted">{plan.status}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

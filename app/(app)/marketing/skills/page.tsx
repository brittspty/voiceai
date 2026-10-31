import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { skillApprovalFanoutEnabled } from "@/lib/marketing/config";
import { decideSkillOffer } from "@/lib/marketing/human-actions";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { listSkillDecisions } from "@/lib/marketing/skill-approval-job";
import { OFFERED_SKILL, skillIsSafe } from "@/lib/marketing/skills";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") return <NoAccess title="New skill offered" />;
  const skill = OFFERED_SKILL;
  const safe = skillIsSafe(skill);
  const fanout = skillApprovalFanoutEnabled();
  const log = fanout ? await listSkillDecisions() : [];
  return (
    <div>
      <h1 className="text-2xl font-semibold">New skill offered</h1>
      <p className="mt-1 text-sm text-muted">Every super admin can answer yes or no. The owner is not the only person. Nothing is turned on until someone says yes.</p>
      {!safe && <p className="mt-4">We couldn&apos;t check this skill&apos;s source, so it can&apos;t be added yet.</p>}
      {safe && (
        <article className="mt-4 rounded-xl border border-line bg-card p-4" aria-labelledby="skill-title">
          <p className="text-xs font-bold uppercase text-muted">Super admins only</p>
          <h2 id="skill-title" className="mt-2 text-lg font-semibold">Add the skill &quot;{skill.name}&quot;?</h2>
          <p className="mt-2"><b>What it does: </b>{skill.summary}</p>
          <p className="mt-2"><b>Source: </b>{skill.source}</p>
          <h3 className="mt-4 text-sm font-semibold uppercase text-muted">It will be able to</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {skill.can.map((line) => <li key={line}>{line}</li>)}
            {skill.cannot.map((line) => <li key={line}>Cannot: {line}</li>)}
          </ul>
          <p className="mt-3 text-sm"><b>{skill.risk} risk. </b>{skill.riskReason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={decideSkillOffer}>
              <input type="hidden" name="choice" value="yes" />
              <button className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-on-brand">Yes, add skill</button>
            </form>
            <form action={decideSkillOffer}>
              <input type="hidden" name="choice" value="no" />
              <button className="min-h-11 rounded-lg border border-line bg-card px-5 font-semibold text-ink">No, skip it</button>
            </form>
          </div>
        </article>
      )}
      {fanout && (
        <section className="mt-6">
          <h2 className="font-semibold">Audit log</h2>
          {!log.length && <p className="mt-2 text-sm text-muted">No answers yet.</p>}
          <ul className="mt-2 space-y-2 text-sm">
            {log.map((row) => (
              <li key={row.id} className="rounded-lg border border-line bg-card px-3 py-2">
                {row.user.name} said {row.choice === "yes" ? "yes" : "no"} to {row.skillName}. {formatDateTime(row.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

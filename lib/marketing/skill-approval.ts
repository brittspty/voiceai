import type { Env } from "./config";
import { skillApprovalFanoutEnabled } from "./config";
import { isSuperAdmin } from "./access";
import { OFFERED_SKILL } from "./skills";

export type SkillPerson = { id: string; email: string; role: string; name?: string };

/** Every super admin. A plain owner is not included. */
export function skillOfferRecipients(users: SkillPerson[], env: Env = process.env) {
  return users.filter((user) => isSuperAdmin(user, env));
}

export function skillDecisionRecord(input: { userId: string; choice: string; at?: Date }) {
  const choice = input.choice === "yes" ? "yes" : "no";
  return {
    userId: input.userId,
    skillName: OFFERED_SKILL.name,
    choice,
    createdAt: input.at ?? new Date(),
  };
}

export function skillOfferNotice(person: SkillPerson) {
  return {
    userId: person.id,
    kind: "skill_offer" as const,
    title: OFFERED_SKILL.name,
    body: `${OFFERED_SKILL.summary} ${OFFERED_SKILL.riskReason}`,
    href: "/marketing/skills",
    payload: { skill: OFFERED_SKILL.name, pending: true },
  };
}

export function skillFanoutPlan(users: SkillPerson[], env: Env = process.env) {
  if (!skillApprovalFanoutEnabled(env)) return { enabled: false as const, notices: [] as ReturnType<typeof skillOfferNotice>[] };
  return { enabled: true as const, notices: skillOfferRecipients(users, env).map(skillOfferNotice) };
}

import { prisma } from "../db";
import { skillApprovalFanoutEnabled, type Env } from "./config";
import { skillFanoutPlan } from "./skill-approval";

export async function ensureSkillOfferInbox(env: Env = process.env) {
  if (!skillApprovalFanoutEnabled(env)) return { status: "skipped" as const, created: 0 };
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, name: true } });
  const plan = skillFanoutPlan(users, env);
  if (!plan.enabled) return { status: "skipped" as const, created: 0 };
  let created = 0;
  for (const notice of plan.notices) {
    const existing = await prisma.staffNotification.findFirst({
      where: { userId: notice.userId, kind: "skill_offer", title: notice.title },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.staffNotification.create({ data: notice });
    created += 1;
  }
  return { status: "ran" as const, created };
}

export async function listSkillDecisions() {
  if (!skillApprovalFanoutEnabled()) return [];
  return prisma.skillDecision.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true, email: true } } },
  });
}

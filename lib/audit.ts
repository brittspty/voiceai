import { prisma } from "./db";
import type { Actor } from "./types";

export async function audit(
  actor: Actor,
  action: string,
  target: { type: string; id?: string | null; label?: string | null },
) {
  await prisma.activity.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetType: target.type,
      targetId: target.id ?? null,
      targetLabel: target.label ?? null,
    },
  });
}

import { prisma } from "./db";
import type { MagicLinkRecord, MagicLinkStore } from "./magic-link";

export const magicLinkStore: MagicLinkStore = {
  async create(row: MagicLinkRecord) {
    await prisma.magicLink.create({ data: row });
  },
  async find(tokenHash: string) {
    const row = await prisma.magicLink.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return { email: row.email, tokenHash: row.tokenHash, expiresAt: row.expiresAt, usedAt: row.usedAt };
  },
  async markUsed(tokenHash: string, usedAt: Date) {
    const updated = await prisma.magicLink.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: usedAt } },
      data: { usedAt },
    });
    return updated.count === 1;
  },
};

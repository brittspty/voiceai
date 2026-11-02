import { prisma } from "./db";
import type { PasswordResetRecord, PasswordResetStore } from "./password-reset";

export const passwordResetStore: PasswordResetStore = {
  async create(row: PasswordResetRecord) {
    await prisma.passwordReset.create({ data: row });
  },
  async find(tokenHash: string) {
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return { email: row.email, tokenHash: row.tokenHash, expiresAt: row.expiresAt, usedAt: row.usedAt };
  },
  async markUsed(tokenHash: string, usedAt: Date) {
    const updated = await prisma.passwordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: usedAt } },
      data: { usedAt },
    });
    return updated.count === 1;
  },
};

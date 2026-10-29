import { prisma } from "../db";
import type { BudgetStore } from "./budget";

/** Prisma writer for the human budget. Callers must already have passed setCampaignBudget. */
export function prismaBudgetStore(): BudgetStore {
  return {
    async write(input) {
      await prisma.$transaction([
        prisma.campaign.update({
          where: { id: input.campaignId },
          data: {
            budgetAmount: input.amount,
            budgetType: input.period,
            budgetCurrency: input.currency,
            budgetSetById: input.setById,
            budgetSetAt: input.setAt,
          },
        }),
        prisma.campaignBudgetAudit.create({
          data: {
            campaignId: input.campaignId,
            amount: input.amount,
            period: input.period,
            currency: input.currency,
            setById: input.setById,
            setAt: input.setAt,
            source: input.source,
            recommendationId: input.recommendationId ?? null,
            note: input.note || "",
          },
        }),
      ]);
    },
  };
}

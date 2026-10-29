import { canEditCampaignBudget, type MarketingAccess } from "./access";

export type HumanBudgetActor = {
  kind: "human";
  access: MarketingAccess;
};

export type BudgetWrite = {
  campaignId: string;
  adAccountId: string;
  amount: string;
  period: "daily" | "lifetime";
  currency: string;
  source: "human_edit" | "recommendation_accept";
  recommendationId?: string;
  note?: string;
};

export type BudgetStore = {
  write(input: BudgetWrite & { setById: string; setAt: Date }): Promise<void>;
};

export function assertHumanBudgetActor(actor: { kind: string; access?: MarketingAccess }) {
  if (actor.kind !== "human" || !actor.access) {
    throw new Error("Only a person can set a campaign budget.");
  }
  if (!actor.access.canEditBudget) {
    throw new Error("You can't change this budget.");
  }
}

/**
 * The only writer for the human campaign budget. Sync, the monitor, and worker jobs must not call it.
 * This never calls an ad platform.
 */
export async function setCampaignBudget(
  actor: { kind: string; access?: MarketingAccess },
  input: BudgetWrite,
  store: BudgetStore,
  now = new Date(),
) {
  assertHumanBudgetActor(actor);
  const access = actor.access as MarketingAccess;
  if (!canEditCampaignBudget(access, { adAccountId: input.adAccountId, campaignId: input.campaignId })) {
    throw new Error("That campaign is outside your scope.");
  }
  if (input.period !== "daily" && input.period !== "lifetime") {
    throw new Error("Budget period must be daily or lifetime.");
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Budget amount is not a number.");
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a 3-letter code.");
  await store.write({
    ...input,
    amount: amount.toFixed(4),
    currency,
    setById: access.userId,
    setAt: now,
  });
}

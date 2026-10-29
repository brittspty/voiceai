"use client";

import { saveCampaignBudget } from "@/lib/marketing/human-actions";

export function BudgetEditor({
  campaignId,
  adAccountId,
  period,
  currency,
}: {
  campaignId: string;
  adAccountId: string;
  period: string;
  currency: string;
}) {
  return (
    <form
      action={saveCampaignBudget}
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        const form = event.currentTarget;
        const amount = String(new FormData(form).get("amount") || "");
        if (!window.confirm(`Save ${amount} ${currency} as the budget? Only a person can change it. Nothing is sent to the ad account.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="adAccountId" value={adAccountId} />
      <label className="text-xs text-muted">
        Amount
        <input name="amount" type="number" min="0" step="0.01" required className="mt-1 block h-9 w-24 rounded-md border border-line px-2 text-sm text-ink" />
      </label>
      <label className="text-xs text-muted">
        Period
        <select name="period" defaultValue={period === "lifetime" ? "lifetime" : "daily"} className="mt-1 block h-9 rounded-md border border-line bg-card px-1 text-sm text-ink">
          <option value="daily">Daily</option>
          <option value="lifetime">Lifetime</option>
        </select>
      </label>
      <label className="text-xs text-muted">
        Currency
        <input name="currency" defaultValue={currency} className="mt-1 block h-9 w-16 rounded-md border border-line px-2 text-sm text-ink" />
      </label>
      <button className="h-9 rounded-full bg-brand px-3 text-sm font-semibold text-on-brand">Save</button>
    </form>
  );
}

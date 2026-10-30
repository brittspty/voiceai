import { SearchWasteBatch } from "@/components/search-waste-batch";
import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { searchWasteEnabled } from "@/lib/marketing/config";
import { importSearchTerms } from "@/lib/marketing/feature-actions";
import { accountFilter, canReviewSearchWaste } from "@/lib/marketing/feature-access";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { listAdAccountChoices, listNegativeProposals, loadSearchWasteConfig } from "@/lib/marketing/search-waste-store";

export const dynamic = "force-dynamic";

export default async function SearchWastePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!searchWasteEnabled()) {
    return (
      <div>
        <PageTitle title="Negative keywords" subtitle="Search-term waste is turned off." />
      </div>
    );
  }
  if (!canReviewSearchWaste(access)) return <NoAccess title="Negative keywords" />;
  const query = await searchParams;
  const allowed = accountFilter(access);
  const [accounts, proposals, config] = await Promise.all([
    listAdAccountChoices(access.workspaceId),
    listNegativeProposals(access),
    loadSearchWasteConfig(access.workspaceId),
  ]);
  const visibleAccounts = accounts.filter((account) => allowed === "all" || allowed.includes(account.id));
  return (
    <div>
      <PageTitle
        title="Negative keywords"
        subtitle="Searches that spent money without a qualified conversion. Download a CSV and add the negatives in Google Ads. Nothing here writes to an ad account."
      />
      {query.error ? <p className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm" role="alert">{query.error}</p> : null}
      {!visibleAccounts.length ? (
        <p className="rounded-xl border border-line bg-card p-6 text-sm">Connect an ad account before importing a search-terms report.</p>
      ) : (
        <form action={importSearchTerms} className="mb-6 grid gap-3 rounded-xl border border-line bg-card p-4">
          <label className="text-sm font-medium">
            Ad account
            <select name="adAccountId" className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" required>
              {visibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Google search terms report
            <textarea name="report" required rows={6} className="mt-1 w-full rounded-lg border border-line bg-card p-2 font-mono text-sm" placeholder="Paste the CSV exported from Google Ads" />
          </label>
          <label className="text-sm font-medium">
            Brand names to keep
            <input name="brandTerms" defaultValue={(config?.brandTerms || []).join(", ")} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" />
          </label>
          <label className="text-sm font-medium">
            Other locations
            <input name="otherLocations" defaultValue={(config?.otherLocations || []).join(", ")} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2" placeholder="Cities that are outside the service area" />
          </label>
          <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit">Find wasted searches</button>
        </form>
      )}
      {proposals.length ? <SearchWasteBatch rows={proposals} seesCost={access.seesCost} /> : <p className="rounded-xl border border-line bg-card p-6 text-sm">No wasted searches found this week.</p>}
    </div>
  );
}

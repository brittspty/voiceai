import { DecisionQueue } from "@/components/decision-queue";
import { HourlySummary } from "@/components/hourly-summary";
import { ShareLinkButton } from "@/components/share-link-button";
import { Pill } from "@/components/pills";
import { PageTitle } from "@/components/shell";
import { BudgetEditor } from "@/components/budget-editor";
import { formatDateTime } from "@/lib/format";

type AccountRow = {
  id: string;
  name: string;
  platform: string;
  externalId: string;
  currency: string;
  timezone: string;
  status: string;
  syncEnabled: boolean;
};

type CampaignRow = {
  id: string;
  name: string;
  accountId: string;
  account: string;
  objective: string;
  status: string;
  budgetType?: string | null;
  budgetAmount?: number | null;
  budgetCurrency?: string | null;
  budgetSetAt?: string | null;
  reportedBudgetType?: string | null;
  reportedBudgetAmount?: number | null;
  currency?: string | null;
  adGroups: number;
};

type AlertRow = { id: string; severity: string; title: string; summary: string; ad: string; account: string; detectedAt: string };
type RecommendationRow = {
  id: string;
  type: string;
  status: string;
  title: string;
  summary: string;
  rationale: string;
  metric: string;
  baseline: string;
  observed: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  sourceCount: number;
  createdAt?: string;
  decidedAt?: string | null;
  decisionNote?: string | null;
  verifierNote?: string | null;
  currentBudgetAmount?: number | null;
  proposedBudgetAmount?: number | null;
  proposedCurrency?: string | null;
  proposedBudgetPeriod?: string | null;
  campaignId: string | null;
  adAccountId: string | null;
};
type DigestRow = { id: string; createdAt: string; delivery: string; payload: unknown };

type MetricRow = {
  id: string;
  date: string;
  account: string;
  campaign: string;
  ad: string;
  currency?: string | null;
  spend?: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
};

type LastRun = {
  status: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  rowsWritten: number;
  error: string | null;
  note: string;
  accounts: string[];
  since: string | null;
  until: string | null;
};

type Total = { currency?: string; spend?: number; impressions: number; clicks: number; leads: number };

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  google_ads: "Google Ads",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function tone(status: string): "green" | "amber" | "red" | "gray" {
  if (status === "active" || status === "succeeded" || status === "connected") return "green";
  if (status === "paused" || status === "running" || status === "mock") return "amber";
  if (status === "failed" || status === "error" || status === "deleted") return "red";
  return "gray";
}

function money(amount: number, currency: string) {
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
}

function count(value: number) {
  return value.toLocaleString("en-US");
}

function formatIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function rate(clicks: number, impressions: number) {
  if (!impressions) return "—";
  return `${((clicks / impressions) * 100).toFixed(2)}%`;
}

function cpc(spend: number, clicks: number, currency: string) {
  if (!clicks) return "—";
  return money(spend / clicks, currency);
}

function budget(row: CampaignRow) {
  if (row.budgetAmount == null || row.budgetType === "none" || !row.budgetType) return "Not set";
  const suffix = row.budgetType === "daily" ? " / day" : " lifetime";
  return `${money(row.budgetAmount, row.budgetCurrency || row.currency || "USD")}${suffix}`;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] tracking-wide text-muted">
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function MarketingView(props: {
  mock: boolean;
  accounts: AccountRow[];
  campaigns: CampaignRow[];
  rows: MetricRow[];
  lastRun: LastRun | null;
  totals: Total[];
  alerts?: AlertRow[];
  recommendations?: RecommendationRow[];
  digests?: DigestRow[];
  flags?: { monitor: boolean; digest: boolean; clientLinks: boolean; canEditBudget: boolean; canCreateShareLink: boolean; seesCost?: boolean; isSuperAdmin?: boolean; budgetCap?: number };
}) {
  const seesCost = Boolean(props.flags?.seesCost);
  const impressions = props.totals.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = props.totals.reduce((sum, row) => sum + row.clicks, 0);
  const leads = props.totals.reduce((sum, row) => sum + row.leads, 0);
  const campaignHeaders = seesCost ? ["Campaign", "Account", "Objective", "Status", "Your budget", "Ad sets"] : ["Campaign", "Account", "Objective", "Status", "Ad sets"];
  const metricHeaders = seesCost
    ? ["Date", "Account", "Campaign", "Ad", "Spend", "Impr.", "Clicks", "CTR", "CPC", "Reach", "Leads"]
    : ["Date", "Account", "Campaign", "Ad", "Impr.", "Clicks", "CTR", "Reach", "Leads"];
  return (
    <div>
      <PageTitle
        title="Marketing"
        subtitle={
          props.flags?.canEditBudget
            ? "Ad accounts, campaigns, and daily performance. Reach is shown per row and is not added up."
            : "Ad accounts, campaigns, and daily performance. Read only. Reach is shown per row and is not added up."
        }
      />
      {props.mock && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <Pill tone="amber">MOCK</Pill>
          <span className="font-semibold text-ink">EXAMPLE DATA</span>
        </div>
      )}
      {props.lastRun?.error && (
        <div className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <Pill tone="red">{props.lastRun.status}</Pill>
          <span className="ml-2 text-muted">{props.lastRun.error}</span>
        </div>
      )}
      {props.lastRun && (
        <p className="mb-4 text-sm text-muted">
          Last sync {props.lastRun.mode} · {props.lastRun.status}
          {props.lastRun.finishedAt ? ` · ${formatDateTime(props.lastRun.finishedAt)}` : ""}
          {props.lastRun.since && props.lastRun.until ? ` · ${formatIso(props.lastRun.since)} – ${formatIso(props.lastRun.until)}` : ""}
          {` · ${props.lastRun.rowsWritten.toLocaleString("en-US")} rows`}
          {props.lastRun.accounts.length ? ` · ${props.lastRun.accounts.length} account${props.lastRun.accounts.length === 1 ? "" : "s"}` : ""}
        </p>
      )}
      {!props.accounts.length ? (
        <div className="rounded-xl border border-line bg-card p-6 text-sm text-muted">
          No ad accounts yet. Set a Meta system user token, app id, app secret, and <span className="font-medium text-ink">META_AD_ACCOUNT_IDS</span>{" "}
          (one id or a comma-separated list), then let the worker sync. Or set <span className="font-medium text-ink">MARKETING_SYNC_MODE=mock</span> to
          load labeled fixture data. Nothing is pulled while credentials are missing.
        </div>
      ) : (
        <div className="space-y-6">
          {props.totals.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {seesCost &&
                props.totals.map((total) => (
                  <div key={total.currency} className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
                    <div className="text-xs text-muted">Spend · {total.currency}</div>
                    <div className="mt-1 text-xl font-semibold">{money(total.spend ?? 0, total.currency || "USD")}</div>
                  </div>
                ))}
              <div className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
                <div className="text-xs text-muted">Impressions</div>
                <div className="mt-1 text-xl font-semibold">{count(impressions)}</div>
              </div>
              <div className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
                <div className="text-xs text-muted">Clicks</div>
                <div className="mt-1 text-xl font-semibold">{count(clicks)}</div>
              </div>
              <div className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
                <div className="text-xs text-muted">Platform leads</div>
                <div className="mt-1 text-xl font-semibold">{count(leads)}</div>
              </div>
            </div>
          )}

          <section>
            <h2 className="mb-2 font-medium">Ad accounts</h2>
            <Table headers={["Account", "Platform", "External id", "Currency", "Timezone", "Status"]}>
              {props.accounts.map((account) => (
                <tr key={account.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{account.name}</td>
                  <td className="px-4 py-3">{PLATFORM_LABEL[account.platform] ?? account.platform}</td>
                  <td className="px-4 py-3 text-muted">{account.externalId}</td>
                  <td className="px-4 py-3">{account.currency}</td>
                  <td className="px-4 py-3">{account.timezone}</td>
                  <td className="px-4 py-3">
                    <Pill tone={tone(account.status)}>{label(account.status)}</Pill>
                  </td>
                </tr>
              ))}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Campaigns</h2>
            <Table headers={campaignHeaders}>
              {props.campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{campaign.name}</td>
                  <td className="px-4 py-3">{campaign.account}</td>
                  <td className="px-4 py-3 capitalize">{label(campaign.objective)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={tone(campaign.status)}>{label(campaign.status)}</Pill>
                  </td>
                  {seesCost && (
                    <td className="px-4 py-3">
                      <div>{budget(campaign)}</div>
                      {campaign.reportedBudgetAmount != null && campaign.reportedBudgetType !== "none" && (
                        <div className="text-xs text-muted">Platform reported {money(campaign.reportedBudgetAmount, campaign.currency || "USD")}</div>
                      )}
                      {props.flags?.canEditBudget && campaign.budgetAmount != null && campaign.budgetType && campaign.budgetType !== "none" && (
                        <BudgetEditor
                          campaignId={campaign.id}
                          adAccountId={campaign.accountId}
                          period={campaign.budgetType}
                          currency={campaign.budgetCurrency || campaign.currency || "USD"}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">{campaign.adGroups}</td>
                </tr>
              ))}
              {!props.campaigns.length && (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={campaignHeaders.length}>
                    No campaigns synced yet.
                  </td>
                </tr>
              )}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Daily performance</h2>
            <Table headers={metricHeaders}>
              {props.rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-muted">{formatIso(row.date)}</td>
                  <td className="px-4 py-3">{row.account}</td>
                  <td className="px-4 py-3">{row.campaign}</td>
                  <td className="px-4 py-3">{row.ad}</td>
                  {seesCost && <td className="px-4 py-3">{money(row.spend ?? 0, row.currency || "USD")}</td>}
                  <td className="px-4 py-3">{count(row.impressions)}</td>
                  <td className="px-4 py-3">{count(row.clicks)}</td>
                  <td className="px-4 py-3">{rate(row.clicks, row.impressions)}</td>
                  {seesCost && <td className="px-4 py-3">{cpc(row.spend ?? 0, row.clicks, row.currency || "USD")}</td>}
                  <td className="px-4 py-3">{count(row.reach)}</td>
                  <td className="px-4 py-3">{count(row.leads)}</td>
                </tr>
              ))}
              {!props.rows.length && (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={metricHeaders.length}>
                    No daily rows yet.
                  </td>
                </tr>
              )}
            </Table>
            <p className="mt-2 text-xs text-muted">Latest 100 rows. One row is one ad on one day. Do not add reach across rows.</p>
          </section>

          <div id="queue">
            {props.flags?.monitor ? (
              <DecisionQueue
                cards={(props.recommendations ?? []).filter((card) => seesCost || (card.type !== "budget_change" && card.type !== "roi" && !["cpc", "cpm", "cpa", "cpl", "budget", "roi", "spend", "cost"].includes(card.metric)))}
                canAct={Boolean(props.flags.canEditBudget)}
                isSuperAdmin={props.flags.isSuperAdmin}
                budgetCap={props.flags.budgetCap}
              />
            ) : (
              <p className="text-sm text-muted">Decision cards are turned off.</p>
            )}
          </div>
          <HourlySummary enabled={Boolean(props.flags?.digest)} digests={props.digests ?? []} />

          <section>
            <h2 className="mb-2 font-medium">Client link</h2>
            {props.flags?.clientLinks && props.flags.canCreateShareLink ? (
              <div className="space-y-2">
                <ShareLinkButton />
                <p className="text-sm text-muted">New links last 30 days unless you pick a date. <a className="text-brand-ink" href="/marketing/links">Revoke a link</a></p>
              </div>
            ) : (
              <p className="text-sm text-muted">Client links are turned off.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

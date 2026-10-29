import { ShareLinkButton } from "@/components/share-link-button";
import { Pill } from "@/components/pills";
import { PageTitle } from "@/components/shell";
import { decideMarketingRecommendation, saveCampaignBudget } from "@/lib/marketing/human-actions";
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
  budgetType: string;
  budgetAmount: number | null;
  budgetCurrency: string;
  budgetSetAt: string | null;
  reportedBudgetType: string;
  reportedBudgetAmount: number | null;
  currency: string;
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
  currentBudgetAmount: number | null;
  proposedBudgetAmount: number | null;
  proposedCurrency: string | null;
  proposedBudgetPeriod: string | null;
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
  currency: string;
  spend: number;
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

type Total = { currency: string; spend: number; impressions: number; clicks: number; leads: number };

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
  if (row.budgetAmount === null || row.budgetType === "none") return "Not set";
  const suffix = row.budgetType === "daily" ? " / day" : " lifetime";
  return `${money(row.budgetAmount, row.budgetCurrency || row.currency)}${suffix}`;
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
  flags?: { monitor: boolean; digest: boolean; clientLinks: boolean; canEditBudget: boolean; canCreateShareLink: boolean };
}) {
  const impressions = props.totals.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = props.totals.reduce((sum, row) => sum + row.clicks, 0);
  const leads = props.totals.reduce((sum, row) => sum + row.leads, 0);
  return (
    <div>
      <PageTitle
        title="Marketing"
        subtitle="Ad accounts, campaigns, and daily performance. Read only. Reach is shown per row and is not added up."
      />
      {props.mock && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          <Pill tone="amber">Mock data</Pill>
          <span className="text-muted">Fixture rows for this workspace. Not a live ad account.</span>
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
              {props.totals.map((total) => (
                <div key={total.currency} className="rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
                  <div className="text-xs text-muted">Spend · {total.currency}</div>
                  <div className="mt-1 text-xl font-semibold">{money(total.spend, total.currency)}</div>
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
            <Table headers={["Campaign", "Account", "Objective", "Status", "Your budget", "Ad sets"]}>
              {props.campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{campaign.name}</td>
                  <td className="px-4 py-3">{campaign.account}</td>
                  <td className="px-4 py-3 capitalize">{label(campaign.objective)}</td>
                  <td className="px-4 py-3">
                    <Pill tone={tone(campaign.status)}>{label(campaign.status)}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <div>{budget(campaign)}</div>
                    {campaign.reportedBudgetAmount !== null && campaign.reportedBudgetType !== "none" && (
                      <div className="text-xs text-muted">Platform reported {money(campaign.reportedBudgetAmount, campaign.currency)}</div>
                    )}
                    {props.flags?.canEditBudget && (
                      <form action={saveCampaignBudget} className="mt-2 flex flex-wrap gap-1">
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <input type="hidden" name="adAccountId" value={campaign.accountId} />
                        <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" className="h-8 w-24 rounded-md border border-line px-2 text-xs" />
                        <select name="period" className="h-8 rounded-md border border-line bg-card px-1 text-xs" defaultValue={campaign.budgetType === "lifetime" ? "lifetime" : "daily"}>
                          <option value="daily">Daily</option>
                          <option value="lifetime">Lifetime</option>
                        </select>
                        <input name="currency" defaultValue={campaign.budgetCurrency || campaign.currency} className="h-8 w-16 rounded-md border border-line px-2 text-xs" />
                        <button className="h-8 rounded-full bg-ink px-2 text-xs text-on-ink">Save</button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3">{campaign.adGroups}</td>
                </tr>
              ))}
              {!props.campaigns.length && (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={6}>
                    No campaigns synced yet.
                  </td>
                </tr>
              )}
            </Table>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Daily performance</h2>
            <Table headers={["Date", "Account", "Campaign", "Ad", "Spend", "Impr.", "Clicks", "CTR", "CPC", "Reach", "Leads"]}>
              {props.rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-muted">{formatIso(row.date)}</td>
                  <td className="px-4 py-3">{row.account}</td>
                  <td className="px-4 py-3">{row.campaign}</td>
                  <td className="px-4 py-3">{row.ad}</td>
                  <td className="px-4 py-3">{money(row.spend, row.currency)}</td>
                  <td className="px-4 py-3">{count(row.impressions)}</td>
                  <td className="px-4 py-3">{count(row.clicks)}</td>
                  <td className="px-4 py-3">{rate(row.clicks, row.impressions)}</td>
                  <td className="px-4 py-3">{cpc(row.spend, row.clicks, row.currency)}</td>
                  <td className="px-4 py-3">{count(row.reach)}</td>
                  <td className="px-4 py-3">{count(row.leads)}</td>
                </tr>
              ))}
              {!props.rows.length && (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={11}>
                    No daily rows yet.
                  </td>
                </tr>
              )}
            </Table>
            <p className="mt-2 text-xs text-muted">Latest 100 rows. One row is one ad on one day. Do not add reach across rows.</p>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Things to look at</h2>
            <p className="mb-2 text-sm text-muted">
              {props.flags?.monitor
                ? "These notes appear after a sync. They are advice. Nothing in your ad account is changed."
                : "Ad checks are turned off."}
            </p>
            <div className="space-y-2">
              {(props.alerts ?? []).map((alert) => (
                <article key={alert.id} className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={alert.severity === "critical" ? "red" : alert.severity === "warning" ? "amber" : "gray"}>{alert.severity}</Pill>
                    <span className="font-medium">{alert.title}</span>
                  </div>
                  <p className="mt-1 text-muted">{alert.summary}</p>
                  <p className="mt-1 text-xs text-muted">{alert.account} · {alert.ad}</p>
                </article>
              ))}
              {!props.alerts?.length && <p className="text-sm text-muted">No notes yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Suggestions</h2>
            <p className="mb-2 text-sm text-muted">A suggestion shows up only after a second check confirms it. Dismissing it does not change the ad account.</p>
            <div className="space-y-2">
              {(props.recommendations ?? []).map((rec) => (
                <article key={rec.id} className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={rec.status === "verified" ? "blue" : rec.status === "accepted" ? "green" : "gray"}>{rec.status}</Pill>
                    <span className="font-medium">{rec.title}</span>
                  </div>
                  <p className="mt-1">{rec.summary}</p>
                  <p className="mt-2 text-xs text-muted">
                    {rec.metric} · baseline {rec.baseline} · seen {rec.observed} · {rec.windowStart} to {rec.windowEnd} · {rec.sampleSize.toLocaleString("en-US")} impressions · {rec.sourceCount} source rows
                  </p>
                  {rec.type === "budget_change" && rec.status === "verified" && props.flags?.canEditBudget && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={decideMarketingRecommendation}>
                        <input type="hidden" name="id" value={rec.id} />
                        <input type="hidden" name="decision" value="accept" />
                        <button className="rounded-full bg-ink px-3 py-1 text-xs text-on-ink">Accept local budget</button>
                      </form>
                      <form action={decideMarketingRecommendation}>
                        <input type="hidden" name="id" value={rec.id} />
                        <input type="hidden" name="decision" value="decline" />
                        <button className="rounded-full border border-line px-3 py-1 text-xs">Decline</button>
                      </form>
                    </div>
                  )}
                  {rec.type !== "budget_change" && rec.status === "verified" && (
                    <form action={decideMarketingRecommendation} className="mt-3">
                      <input type="hidden" name="id" value={rec.id} />
                      <input type="hidden" name="decision" value="dismiss" />
                      <button className="rounded-full border border-line px-3 py-1 text-xs">Dismiss</button>
                    </form>
                  )}
                </article>
              ))}
              {!props.recommendations?.length && <p className="text-sm text-muted">No confirmed suggestions yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Hourly update</h2>
            <p className="mb-2 text-sm text-muted">
              {props.flags?.digest ? "A stored summary for the account manager. Email and text messages are off." : "Hourly updates are turned off."}
            </p>
            <div className="space-y-2">
              {(props.digests ?? []).map((digest) => (
                <article key={digest.id} className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
                  <div className="text-xs text-muted">{formatDateTime(digest.createdAt)} · not sent</div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{JSON.stringify(digest.payload, null, 2)}</pre>
                </article>
              ))}
              {!props.digests?.length && <p className="text-sm text-muted">No stored updates yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-medium">Client link</h2>
            {props.flags?.clientLinks && props.flags.canCreateShareLink ? (
              <ShareLinkButton />
            ) : (
              <p className="text-sm text-muted">Client links are turned off.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

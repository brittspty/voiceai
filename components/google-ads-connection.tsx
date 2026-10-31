import { AlertTriangle, Check, MinusCircle } from "lucide-react";
import { DataChip } from "@/components/data-chip";
import type { GoogleAdsConnectionView } from "@/lib/marketing/google-connection";

function when(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

function Chip({ chip, label }: { chip: GoogleAdsConnectionView["chip"]; label: string }) {
  const tone =
    chip === "connected"
      ? "bg-success-soft text-success"
      : chip === "needs_attention"
        ? "bg-warning-soft text-warning"
        : "bg-chip text-ink";
  const Icon = chip === "connected" ? Check : chip === "needs_attention" ? AlertTriangle : MinusCircle;
  return (
    <span className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

export function GoogleAdsConnection({
  view,
  timeZone,
  canManage,
  demoData = false,
}: {
  view: GoogleAdsConnectionView;
  timeZone: string;
  canManage: boolean;
  demoData?: boolean;
}) {
  const primary =
    view.chip === "not_connected"
      ? { href: "#google-ads-setup", label: "See how to turn it on" }
      : { href: "/marketing/connections", label: "Retry" };

  return (
    <div className="space-y-4">
      {view.exampleData && (
        <div className="rounded-xl border border-line bg-card px-4 py-3 text-sm" role="note">
          <DataChip demo={demoData} />
          <span className="ml-2 text-muted">Fixtures only. Google Ads is not called.</span>
        </div>
      )}

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="google-ads-status-heading">
        <h2 id="google-ads-status-heading" className="text-base font-semibold">Connection status</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center" role="status" aria-live="polite">
          <Chip chip={view.chip} label={view.chipLabel} />
          <p className="text-sm">{view.summary}</p>
        </div>
        {view.lastSyncAt && (
          <p className="mt-3 text-sm text-muted">Last read {when(view.lastSyncAt, timeZone)}.</p>
        )}
        {view.error && (
          <p className="mt-3 text-sm" role="alert">
            {view.lastSyncAt
              ? `Google Ads did not finish the read on ${when(view.lastSyncAt, timeZone)}. `
              : "Google Ads did not finish the last read. "}
            {view.error}
          </p>
        )}
        <p className="mt-3 text-sm text-muted">
          Allowed calls are Google Ads search and search stream. Mutate calls are blocked. Campaigns, budgets, and keywords are not changed.
        </p>
        <div className="mt-4 sm:max-w-xs">
          <a className="btn-brand inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm sm:w-auto" href={primary.href}>
            {primary.label}
          </a>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="google-ads-credentials-heading">
        <h2 id="google-ads-credentials-heading" className="text-base font-semibold">Server credentials</h2>
        <p className="mt-1 text-sm text-muted">
          {canManage
            ? "Values stay in the server environment. This page never asks for a password or a token."
            : "A super admin sets these on the server. This page never asks for a password or a token."}
        </p>
        <ul className="mt-4 divide-y divide-line">
          {view.credentials.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span id={`credential-${row.id}`} className="text-sm font-medium">{row.label}</span>
              <span className="inline-flex min-h-11 items-center gap-2 text-sm" aria-labelledby={`credential-${row.id}`}>
                {row.present ? <Check className="h-4 w-4" aria-hidden="true" /> : <MinusCircle className="h-4 w-4" aria-hidden="true" />}
                {row.present ? "Set" : "Missing"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section id="google-ads-setup" className="rounded-xl border border-line bg-card p-4 sm:p-5" aria-labelledby="google-ads-setup-heading">
          <h2 id="google-ads-setup-heading" className="text-base font-semibold">Setup</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Create an OAuth client and a refresh token with the Google Ads scope. The scope can write. This app still refuses every mutate call.</li>
            <li>Add a developer token and the 10-digit login customer ID for the manager account.</li>
            <li>Set the variables on the app and the worker. The account list is GOOGLE_ADS_CUSTOMER_IDS. Leave them empty and the sync does nothing.</li>
            <li>Set MARKETING_GOOGLE_ADS to on. Set MARKETING_SYNC_MODE to mock to load example data without calling Google.</li>
            <li>To roll back, set MARKETING_GOOGLE_ADS to off and restart. Stored campaigns stay. Google is not called.</li>
          </ol>
          <p className="mt-3 text-sm text-muted">
            Variable names: MARKETING_GOOGLE_ADS, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_CUSTOMER_IDS, GOOGLE_ADS_API_VERSION. The API version is v26.
          </p>
        </section>
      )}

      {!canManage && (
        <section id="google-ads-setup" className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Setup</h2>
          <p className="mt-2 text-sm">A super admin turns Google Ads sync on in the server environment. Reconnect does not happen in this page.</p>
        </section>
      )}
    </div>
  );
}

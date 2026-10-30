"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PageTitle } from "@/components/shell";
import { addLandingPage, assignAccountToClient, createMarketingClient, muteLandingPage, resumeLandingPage, savePageWriteCredential, setPageMonitorOptIn, stopWatchingPage } from "@/lib/marketing/page-actions";
import type { ClientPageRow, LandingScreen, PageNotice, StaffPageRow } from "@/lib/marketing/pages/view";

function StatusChip({ status, label }: { status: string; label: string }) {
  const Icon = status === "up" ? CircleCheck : status === "slow" ? Clock : CircleAlert;
  const tone = status === "up" ? "bg-success-soft text-success" : status === "slow" ? "bg-warning-soft text-warning" : status === "unchecked" ? "bg-chip text-muted" : "bg-danger-soft text-danger";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function UptimeStrip({ days, text }: { days: { label: string; state: string }[]; text: string }) {
  return (
    <div>
      <div className="flex gap-1">
        {days.map((day) => {
          const word = day.state === "up" ? "Up" : day.state === "down" ? "Down" : day.state === "mixed" ? "Mixed" : "None";
          const tone = day.state === "up" ? "bg-success-soft text-success" : day.state === "down" ? "bg-danger-soft text-danger" : day.state === "mixed" ? "bg-warning-soft text-warning" : "bg-chip text-muted";
          return (
            <div key={day.label} className={`min-w-0 flex-1 rounded-md px-1 py-1 text-center text-[10px] font-medium ${tone}`}>
              <span className="sr-only">{day.label} </span>
              {word}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

function NoticeCard({ notice, canManage }: { notice: PageNotice; canManage: boolean }) {
  const tone = notice.tone === "critical" ? "border-danger" : notice.tone === "warning" ? "border-warning" : "border-success";
  return (
    <article className={`rounded-2xl border bg-card p-4 ${tone}`} aria-live="polite">
      <h2 className="text-base font-semibold">{notice.title}</h2>
      {notice.summary && notice.summary !== notice.ads.map((ad) => ad.name).join(", ") && <p className="mt-1 text-sm text-muted">{notice.summary}</p>}
      {notice.ads.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {notice.ads.map((ad) => (
            <li key={ad.name}>{ad.name}</li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          {notice.canResume && (
              <ConfirmButton
              label="Resume"
              title="Resume these ads?"
              body="Resume the ads we paused for this page? They will send people here again."
              confirmLabel="Resume ads"
              className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm"
              action={async () => {
                const result = await resumeLandingPage({ pageId: notice.pageId });
                if (!result.ok) throw new Error(result.message);
              }}
            />
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm"
            onClick={() => void muteLandingPage(notice.pageId)}
          >
            Mute this for 24h
          </button>
        </div>
      )}
    </article>
  );
}

function PageRow({ row, staff }: { row: StaffPageRow | ClientPageRow; staff: StaffPageRow | null }) {
  const [open, setOpen] = useState(false);
  const panelId = `page-${row.id}`;
  return (
    <div className="rounded-2xl border border-line bg-card">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <StatusChip status={row.status} label={row.statusLabel} />
        <span className="font-medium">{row.name}</span>
        {staff?.clientName && <span className="hidden text-sm text-muted sm:inline">{staff.clientName}</span>}
        <span className="ml-auto hidden text-sm text-muted sm:inline">{row.checkedLabel}</span>
        {staff?.loadLabel && <span className="hidden text-sm text-muted sm:inline">{staff.loadLabel}</span>}
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-4 py-4">
          {row.summary !== row.uptimeText && <p className="text-sm">{row.summary}</p>}
          <div className={row.summary !== row.uptimeText ? "mt-3" : ""}>
            <UptimeStrip days={row.uptime} text={row.uptimeText} />
          </div>
          {staff && (
            <div className="mt-4 space-y-1 text-sm text-muted">
              <p>{staff.url}</p>
              <p>{staff.checkedLabel}</p>
              {staff.loadLabel && <p>Load time {staff.loadLabel}</p>}
              {staff.formLabel && <p>{staff.formLabel}</p>}
              {staff.pixelLabel && <p>{staff.pixelLabel}</p>}
              {staff.detail && <p>{staff.detail}</p>}
              {staff.pausedAds.length > 0 && <p>Paused ads: {staff.pausedAds.map((ad) => ad.name).join(", ")}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LandingPagesView({ screen }: { screen: LandingScreen }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const staff = screen.audience === "staff";
  const pages = screen.pages;

  async function onAdd(formData: FormData) {
    setError(null);
    const result = await addLandingPage({
      name: String(formData.get("name") || ""),
      url: String(formData.get("url") || ""),
      clientKey: String(formData.get("clientKey") || ""),
      formTestUrl: String(formData.get("formTestUrl") || ""),
      expectForm: formData.get("expectForm") === "on",
    });
    if (!result.ok) setError(result.message);
    else setMessage(result.message);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Landing pages" subtitle={staff ? "Checks run every 5 minutes. A failed check is confirmed before anyone is alerted." : "Status of your pages."} />
      <div aria-live="polite" className="mb-4 space-y-2 text-sm">
        {message && <p>{message}</p>}
        {error && <p className="text-danger">{error}</p>}
      </div>
      {!screen.monitorOn && (
        <p className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm">
          {staff ? "Page checks are switched off." : "Page checks aren't running yet."}
        </p>
      )}
      {screen.stale && (
        <p className="mb-4 rounded-2xl border border-warning bg-warning-soft px-4 py-3 text-sm">{"We couldn't check pages for 20 min. Status may be stale."}</p>
      )}
      {staff && screen.notices.length > 0 && (
        <div className="mb-4 space-y-3">
          {screen.notices.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} canManage={screen.canManage} />
          ))}
        </div>
      )}
      {staff && screen.canManage && (
        <form action={onAdd} className="mb-4 rounded-2xl border border-line bg-card p-4">
          <h2 className="text-base font-semibold">{pages.length ? "Add a page" : "Add a page to watch"}</h2>
          {!pages.length && <p className="mt-1 text-sm text-muted">{"We'll check it every 5 minutes."}</p>}
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm">
              Client
              <select name="clientKey" required className="min-h-11 rounded-xl border border-line bg-canvas px-3">
                <option value="">Choose a client</option>
                {screen.clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Page name
              <input name="name" required maxLength={80} className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
            </label>
            <label className="grid gap-1 text-sm">
              Page address
              <input name="url" type="url" required inputMode="url" placeholder="https://" className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
            </label>
            <label className="grid gap-1 text-sm">
              Test form address
              <input name="formTestUrl" type="url" inputMode="url" placeholder="Optional. Same site only." className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input name="expectForm" type="checkbox" defaultChecked className="h-4 w-4" />
              This page has a form
            </label>
          </div>
          <button type="submit" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm">Add page</button>
        </form>
      )}
      {!pages.length && !staff && <p className="rounded-2xl border border-line bg-card px-4 py-6 text-sm">No pages are being watched yet.</p>}
      <div className="space-y-3">
        {pages.map((row) => (
          <PageRow key={row.id} row={row} staff={staff && "url" in row ? row : null} />
        ))}
      </div>
      {staff && screen.orphans.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-base font-semibold">Paused after a page was removed</h2>
          {screen.orphans.map((row) => (
            <div key={row.id} className="rounded-2xl border border-line bg-card p-4">
              <p className="text-sm">{row.adName} · {row.pageName}</p>
              {screen.canManage && (
                <ConfirmButton
                  label="Resume"
                  title="Resume this ad?"
                  body="The page record is gone. Resume still turns this ad back on if we paused it."
                  confirmLabel="Resume ad"
                  className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm"
                  action={async () => {
                    const result = await resumeLandingPage({ trackedId: row.id });
                    if (!result.ok) throw new Error(result.message);
                    setMessage(result.message);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {staff && screen.canEditCredentials && <ClientForms screen={screen} onMessage={setMessage} onError={setError} />}
      {staff && screen.canEditCredentials && <OptIn screen={screen} onMessage={setMessage} onError={setError} />}
      {staff && screen.canEditCredentials && <CredentialForm screen={screen} onMessage={setMessage} onError={setError} />}
      {staff && screen.canManage && pages.length > 0 && (
        <div className="mt-6 space-y-2">
          {pages.map((row) => (
            <ConfirmButton
              key={row.id}
              label={`Stop watching ${row.name}`}
              title="Stop watching this page?"
              body="Checks stop. Ads that are already paused stay paused until you resume them."
              confirmLabel="Stop watching"
              danger
              className="inline-flex min-h-11 items-center text-sm text-brand-ink underline"
              action={async () => {
                const result = await stopWatchingPage(row.id);
                if (!result.ok) throw new Error("Couldn't stop watching that page.");
                setMessage(result.message);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientForms({ screen, onMessage, onError }: { screen: LandingScreen; onMessage: (value: string) => void; onError: (value: string) => void }) {
  return (
    <div className="mt-6 space-y-4">
      <form
        className="rounded-2xl border border-line bg-card p-4"
        action={async (formData) => {
          onError("");
          const result = await createMarketingClient(String(formData.get("name") || ""));
          if (!result.ok) onError(result.message);
          else onMessage(result.message);
        }}
      >
        <h2 className="text-base font-semibold">Add a client</h2>
        <label className="mt-3 grid gap-1 text-sm">
          Client name
          <input name="name" required maxLength={80} className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
        </label>
        <button type="submit" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm">Add client</button>
      </form>
      {screen.accounts.length > 0 && screen.clients.length > 0 && (
        <form
          className="rounded-2xl border border-line bg-card p-4"
          action={async (formData) => {
            onError("");
            const result = await assignAccountToClient({
              accountId: String(formData.get("accountId") || ""),
              clientKey: String(formData.get("clientKey") || ""),
            });
            if (!result.ok) onError(result.message);
            else onMessage(result.message);
          }}
        >
          <h2 className="text-base font-semibold">Assign an ad account</h2>
          <p className="mt-1 text-sm text-muted">Ads are paused only when the account belongs to the page&apos;s client.</p>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm">
              Ad account
              <select name="accountId" required className="min-h-11 rounded-xl border border-line bg-canvas px-3">
                {screen.accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}{account.clientName ? ` · ${account.clientName}` : ""}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Client
              <select name="clientKey" required className="min-h-11 rounded-xl border border-line bg-canvas px-3">
                {screen.clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm">Assign</button>
        </form>
      )}
    </div>
  );
}

function OptIn({ screen, onMessage, onError }: { screen: LandingScreen; onMessage: (value: string) => void; onError: (value: string) => void }) {
  if (!screen.clients.length) return null;
  return (
    <div className="mt-4 space-y-4">
      {screen.clients.map((client) => (
        <form
          key={client.id}
          className="rounded-2xl border border-line bg-card p-4"
          action={async (formData) => {
            onError("");
            const result = await setPageMonitorOptIn({
              clientKey: client.id,
              autoPauseOptIn: formData.get("autoPauseOptIn") === "on",
              clientAlertOptIn: formData.get("clientAlertOptIn") === "on",
            });
            if (!result.ok) onError(result.message);
            else onMessage(result.message);
          }}
        >
          <h2 className="text-base font-semibold">{client.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {screen.autoPauseOn ? "Automatic pause is available on this server." : "Automatic pause is switched off on this server."} Meta write: {client.meta}. Google Ads write: {client.google}.
          </p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input name="autoPauseOptIn" type="checkbox" defaultChecked={client.autoPauseOptIn} className="h-4 w-4" />
            Pause ads for {client.name} when a page is down
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input name="clientAlertOptIn" type="checkbox" defaultChecked={client.clientAlertOptIn} className="h-4 w-4" />
            Email {client.name} when a page is down
          </label>
          <button type="submit" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm">Save</button>
        </form>
      ))}
    </div>
  );
}

function CredentialForm({
  screen,
  onMessage,
  onError,
}: {
  screen: LandingScreen;
  onMessage: (value: string) => void;
  onError: (value: string) => void;
}) {
  return (
    <form
      className="mt-4 rounded-2xl border border-line bg-card p-4"
      action={async (formData) => {
        onError("");
        const platform = formData.get("platform") === "google_ads" ? "google_ads" : "meta";
        const result = await savePageWriteCredential({
          clientKey: String(formData.get("clientKey") || ""),
          platform,
          secretRef: String(formData.get("secretRef") || ""),
          appSecretRef: String(formData.get("appSecretRef") || ""),
          extraSecretRef: String(formData.get("extraSecretRef") || ""),
          customerId: String(formData.get("customerId") || ""),
          loginCustomerId: String(formData.get("loginCustomerId") || ""),
        });
        if (!result.ok) onError(result.message);
        else onMessage(result.message);
      }}
    >
      <h2 className="text-base font-semibold">Write access</h2>
      <p className="mt-1 text-sm text-muted">
        Enter environment variable names for one client, not tokens. A saved row is required. Without it, a pause is only logged. Google also requires that customer id in GOOGLE_ADS_CUSTOMER_IDS.
      </p>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm">
          Client
          <select name="clientKey" required className="min-h-11 rounded-xl border border-line bg-canvas px-3">
            <option value="">Choose a client</option>
            {screen.clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Platform
          <select name="platform" className="min-h-11 rounded-xl border border-line bg-canvas px-3">
            <option value="meta">Meta</option>
            <option value="google_ads">Google Ads</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Access token variable
          <input name="secretRef" required autoComplete="off" placeholder="META_PAGE_WRITE_TOKEN" className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          App secret variable
          <input name="appSecretRef" autoComplete="off" placeholder="META_PAGE_WRITE_APP_SECRET" className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Google developer token variable
          <input name="extraSecretRef" autoComplete="off" placeholder="GOOGLE_ADS_DEVELOPER_TOKEN" className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Google customer id
          <input name="customerId" inputMode="numeric" autoComplete="off" className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Google manager account id
          <input name="loginCustomerId" inputMode="numeric" autoComplete="off" className="min-h-11 rounded-xl border border-line bg-canvas px-3" />
        </label>
      </div>
      <button type="submit" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-full px-4 text-sm">Save variable names</button>
    </form>
  );
}

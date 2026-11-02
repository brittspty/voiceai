"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientPerformance } from "@/components/client-performance";
import { MarketingDashboard } from "@/components/marketing-dashboard";
import { PRODUCT_NAME } from "@/lib/brand/names";
import type { ClientShareView } from "@/lib/marketing/client-view";
import type { DashboardModel } from "@/lib/marketing/dashboard-model";
import { parseDashQuery } from "@/lib/marketing/dashboard-model";
import {
  awarenessPreset,
  defaultVisibility,
  filterShareView,
  leadGenPreset,
  shapeClientDashboard,
  type MetricGroup,
  type VisibilityMap,
} from "@/lib/marketing/metric-visibility";

export type MetricSettingRow = {
  id: string;
  group: MetricGroup;
  label: string;
  hint: string;
  on: boolean;
};

const GROUPS: { id: MetricGroup; title: string }[] = [
  { id: "kpi", title: "KPI cards" },
  { id: "chart", title: "Charts" },
  { id: "column", title: "Table columns" },
  { id: "channel", title: "Channels" },
];

export function ClientMetricSettings({
  clients,
  clientId,
  clientName,
  rows,
  canEdit,
  model,
  share,
  dashboardsV2,
}: {
  clients: { id: string; name: string }[];
  clientId: string;
  clientName: string;
  rows: MetricSettingRow[];
  canEdit: boolean;
  model: DashboardModel;
  share: ClientShareView;
  dashboardsV2: boolean;
}) {
  const router = useRouter();
  const initial = useMemo(() => {
    const next: VisibilityMap = {};
    for (const row of rows) next[row.id] = row.on;
    return next;
  }, [rows]);
  const [draft, setDraft] = useState<VisibilityMap>(initial);
  const [saved, setSaved] = useState<VisibilityMap>(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const previewModel = useMemo(() => shapeClientDashboard({ ...model, mode: "client", showMoney: false }, draft), [model, draft]);
  const previewShare = useMemo(() => filterShareView(share, draft), [share, draft]);

  function setAll(next: VisibilityMap) {
    setDraft(next);
    setMessage("");
    setError("");
  }

  async function save() {
    if (!canEdit) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/marketing/metric-visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, metrics: draft }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not save these metrics.");
        return;
      }
      setSaved(draft);
      setMessage("Saved for this client. Share links use the same choices.");
      router.refresh();
    } catch {
      setError("Could not save these metrics.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="list" aria-label="Clients">
        {clients.map((client) => (
          <Link
            key={client.id}
            href={`/marketing/metrics?client=${encodeURIComponent(client.id)}`}
            aria-current={client.id === clientId ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${client.id === clientId ? "bg-ink text-on-ink" : "border border-line bg-card text-ink"}`}
          >
            {client.name}
          </Link>
        ))}
      </div>

      <section className="mb-6 rounded-[14px] border border-line bg-card p-4" aria-labelledby="metric-settings-title">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="metric-settings-title" className="text-lg font-semibold">What {clientName} sees</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              These switches change this client&apos;s dashboard and share links in {PRODUCT_NAME}. Spend, budgets, bids, cost per result, ROAS, margins, and internal costs stay with the Specificity team.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full border border-ink px-4 text-sm font-semibold" disabled={!canEdit} onClick={() => setAll(leadGenPreset())}>Lead gen</button>
            <button type="button" className="min-h-11 rounded-full border border-ink px-4 text-sm font-semibold" disabled={!canEdit} onClick={() => setAll(awarenessPreset())}>Awareness</button>
            <button type="button" className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-semibold" disabled={!canEdit} onClick={() => setAll(defaultVisibility())}>Reset to default</button>
          </div>
        </div>
        {!canEdit && <p className="mb-3 text-sm text-muted">You can review these settings. A super admin or account manager saves changes.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.map((group) => (
            <fieldset key={group.id} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-semibold">{group.title}</legend>
              <ul className="grid gap-2">
                {rows.filter((row) => row.group === group.id).map((row) => (
                  <li key={row.id}>
                    <label className="flex min-h-11 items-start gap-3 rounded-lg px-1 py-1">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        style={{ accentColor: "var(--brand)" }}
                        checked={draft[row.id] !== false}
                        disabled={!canEdit}
                        onChange={(event) => setDraft((current) => ({ ...current, [row.id]: event.target.checked }))}
                      />
                      <span>
                        <span className="block text-sm font-semibold">{row.label}</span>
                        <span className="block text-xs text-muted">{row.hint}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-ink disabled:opacity-50" disabled={!canEdit || pending || !dirty} onClick={() => void save()}>
            {pending ? "Saving" : "Save"}
          </button>
          {message && <p className="text-sm text-ink" role="status">{message}</p>}
          {error && <p className="text-sm font-semibold text-danger" role="alert">{error}</p>}
        </div>
      </section>

      <section id="preview-as-client" className="rounded-[14px] border border-line bg-canvas p-4" aria-labelledby="preview-as-client-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="preview-as-client-title" className="text-lg font-semibold">Preview as client</h2>
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-ink">{dirty ? "Unsaved changes" : "Saved view"}</span>
        </div>
        <p className="mb-4 text-sm text-muted">This is {clientName}&apos;s dashboard in {PRODUCT_NAME}. Nothing here is saved until you choose Save.</p>
        {dashboardsV2 ? (
          <MarketingDashboard model={previewModel} query={parseDashQuery({})} basePath="/marketing/metrics" />
        ) : (
          <ClientPerformance data={previewShare} />
        )}
      </section>
    </div>
  );
}

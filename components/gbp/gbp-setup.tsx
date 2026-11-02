"use client";

import { useState } from "react";
import type { GbpSetupView } from "@/lib/marketing/gbp-view";

export function GbpSetup({ model }: { model: GbpSetupView }) {
  const [view, setView] = useState(model);
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(model.locations.map((row) => [row.locationId, row.assignedClientId || row.suggestedClientId || ""])));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");

  async function assign(locationId: string) {
    const marketingClientId = choices[locationId] || "";
    setMessage("");
    setPending(locationId);
    const response = await fetch("/api/marketing/gbp/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId, marketingClientId }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; setup?: GbpSetupView };
    setPending("");
    if (!response.ok || !body.setup) {
      setMessage(body.error || "That location was not assigned.");
      return;
    }
    setView(body.setup);
    setMessage("Assigned. Nothing was changed on Google.");
  }

  return (
    <section aria-labelledby="gbp-setup-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Add a channel · Staff only</p>
          <h2 id="gbp-setup-title" className="text-2xl font-semibold">Google Business Profile</h2>
        </div>
        <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand">EXAMPLE DATA</span>
      </div>
      <p className={`mb-3 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${view.status === "needs_setup" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
        {view.status === "needs_setup" ? "Needs setup" : "Connected"}
      </p>
      <p className="mb-2 max-w-3xl text-sm">{view.instructions}</p>
      <p className="mb-4 text-sm text-muted">Connected account {view.managerEmail}. Scope {view.scopeLabel}. {view.readOnlyNote}</p>
      <div className="grid gap-3">
        {view.locations.map((location) => (
          <article key={location.locationId} className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{location.title}</h3>
                <p className="text-sm text-muted">{location.address || "No address yet"} · {location.phone || "No phone yet"}</p>
                <p className="text-sm text-muted">{location.primaryCategory || "No category yet"} · {location.websiteUri || "No website yet"}</p>
                {location.assignedClientName ? <p className="mt-1 text-sm font-semibold">Assigned to {location.assignedClientName}</p> : <p className="mt-1 text-sm">{location.suggestion}</p>}
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void assign(location.locationId);
                }}
              >
                <label className="text-sm">
                  Client
                  <select
                    className="mt-1 block min-h-11 rounded-lg border border-line bg-card px-2"
                    aria-label={`Client for ${location.title}`}
                    value={choices[location.locationId] || ""}
                    onChange={(event) => setChoices((current) => ({ ...current, [location.locationId]: event.target.value }))}
                  >
                    <option value="">Choose a client</option>
                    {view.clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="min-h-11 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand" disabled={pending === location.locationId}>
                  {pending === location.locationId ? "Assigning" : "Assign"}
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import type { ConnectionView } from "@/lib/marketing/chatgpt-ads/connect";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    view?: ConnectionView;
    campaignId?: string;
    adGroupId?: string;
    adId?: string;
    statuses?: string[];
    title?: string;
    body?: string;
    contextHints?: string[];
  };
  return { ok: response.ok, payload };
}

export function ChatgptAdsPanel({ view, canSetup, clientId }: { view: ConnectionView; canSetup: boolean; clientId: string }) {
  const [connection, setConnection] = useState(view);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [disconnectReady, setDisconnectReady] = useState(false);
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hints, setHints] = useState("");
  const [platforms, setPlatforms] = useState("web");
  const [locations, setLocations] = useState("");
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [lifetime, setLifetime] = useState("");
  const [maxBid, setMaxBid] = useState("");
  const [link, setLink] = useState("https://example.com/offer");
  const [imageFileId, setImageFileId] = useState("");
  const [utmSource, setUtmSource] = useState("chatgpt");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [csv, setCsv] = useState("");

  async function sendKey() {
    setMessage("");
    const result = await postJson("/api/marketing/chatgpt-ads/connect", {
      action: connection.connected ? "rotate" : "connect",
      clientId,
      apiKey,
    });
    setApiKey("");
    if (!result.ok || !result.payload.view) {
      setMessage(result.payload.message || "The key was not saved.");
      return;
    }
    setConnection(result.payload.view);
    setMessage(connection.connected ? "Key replaced." : "Connected.");
  }

  async function disconnect() {
    if (!disconnectReady) return;
    const result = await postJson("/api/marketing/chatgpt-ads/connect", { action: "disconnect", clientId, confirm: true });
    setDisconnectReady(false);
    if (!result.ok || !result.payload.view) {
      setMessage(result.payload.message || "The key was not removed.");
      return;
    }
    setConnection(result.payload.view);
    setMessage("Disconnected.");
  }

  async function suggest() {
    const result = await postJson("/api/marketing/chatgpt-ads/suggest", { product, audience });
    if (result.payload.title) setTitle(result.payload.title);
    if (result.payload.body) setBody(result.payload.body);
    if (result.payload.contextHints) setHints(result.payload.contextHints.join(", "));
  }

  async function create() {
    const result = await postJson("/api/marketing/chatgpt-ads/staff", {
      action: "create",
      clientId,
      draft: {
        campaignName: product || "Spring launch",
        lifetimeSpendLimitMicros: Number(lifetime),
        locations: split(locations),
        platforms: split(platforms),
        audienceInclude: split(include),
        audienceExclude: split(exclude),
        adGroupName: audience || "US English",
        contextHints: split(hints),
        maxBidMicros: Number(maxBid),
        adName: title || "Chat card",
        title,
        body,
        imageFileId,
        link,
        utmSource,
        utmCampaign,
      },
    });
    if (!result.ok || !result.payload.campaignId) {
      setMessage(result.payload.message || "The draft was not created.");
      return;
    }
    setCreatedId(result.payload.campaignId);
    setMessage("Created paused. It is not live.");
  }

  async function launch() {
    if (!createdId || !confirmLaunch) return;
    const result = await postJson("/api/marketing/chatgpt-ads/staff", {
      action: "launch",
      clientId,
      entity: "campaign",
      id: createdId,
      confirm: true,
    });
    setShowLaunch(false);
    setConfirmLaunch(false);
    setMessage(result.ok ? "Campaign launched." : result.payload.message || "Launch did not run.");
  }

  async function importCsv() {
    const result = await postJson("/api/marketing/chatgpt-ads", { csv, clientId });
    setMessage(result.ok ? "Report imported." : result.payload.message || "Import did not finish.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Connect ChatGPT Ads</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {connection.steps.map((step) => (
            <li key={step.title}>
              <span className="font-medium">{step.title}. </span>
              {step.body}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm">
          <a className="underline" href={connection.settingsUrl} target="_blank" rel="noreferrer">
            Open Ads Manager settings
          </a>
        </p>
        <p className="mt-3 text-sm" role="status">
          {connection.connected
            ? `Connected. Account ${connection.adAccountId}. Key ending ${connection.keyLast4}.`
            : connection.status === "revoked"
              ? "Disconnected. The sealed key was removed."
              : "Not connected."}
        </p>
        <label className="mt-4 block text-sm font-medium" htmlFor="chatgpt-ads-key">
          Ads API key
        </label>
        <input
          id="chatgpt-ads-key"
          className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <button className="btn-brand mt-3 min-h-11 rounded-full px-4 text-sm" type="button" onClick={sendKey}>
          {connection.connected ? "Replace key" : "Test and connect"}
        </button>
        {connection.connected ? (
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm" htmlFor="chatgpt-ads-disconnect">
              <input id="chatgpt-ads-disconnect" type="checkbox" checked={disconnectReady} onChange={(event) => setDisconnectReady(event.target.checked)} />
              Disconnect ChatGPT Ads
            </label>
            <button className="mt-2 min-h-11 rounded-full border border-line px-4 text-sm" type="button" disabled={!disconnectReady} onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : null}
      </section>
      {canSetup ? (
        <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Create a paused campaign</h2>
          <p className="mt-2 text-sm text-muted">Copy can be suggested. The lifetime limit and max bid are typed here. Nothing goes live until Launch is confirmed.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field id="cg-product" label="Product" value={product} onChange={setProduct} />
            <Field id="cg-audience" label="Audience" value={audience} onChange={setAudience} />
            <Field id="cg-title" label="Title" value={title} onChange={setTitle} />
            <Field id="cg-body" label="Body" value={body} onChange={setBody} />
            <Field id="cg-hints" label="Context hints" value={hints} onChange={setHints} />
            <Field id="cg-platforms" label="Platforms" value={platforms} onChange={setPlatforms} />
            <Field id="cg-geo" label="Location ids" value={locations} onChange={setLocations} />
            <Field id="cg-include" label="Audiences to include" value={include} onChange={setInclude} />
            <Field id="cg-exclude" label="Audiences to exclude" value={exclude} onChange={setExclude} />
            <Field id="cg-image" label="Image file id" value={imageFileId} onChange={setImageFileId} />
            <Field id="cg-link" label="Link" value={link} onChange={setLink} />
            <Field id="cg-utm-source" label="UTM source" value={utmSource} onChange={setUtmSource} />
            <Field id="cg-utm-campaign" label="UTM campaign" value={utmCampaign} onChange={setUtmCampaign} />
            <Field id="cg-lifetime" label="Lifetime spend limit (micros)" value={lifetime} onChange={setLifetime} />
            <Field id="cg-bid" label="Max bid (micros)" value={maxBid} onChange={setMaxBid} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="min-h-11 rounded-full border border-line px-4 text-sm" type="button" onClick={suggest}>
              Suggest copy
            </button>
            <button className="btn-brand min-h-11 rounded-full px-4 text-sm" type="button" onClick={create}>
              Create paused
            </button>
          </div>
          {createdId ? (
            <div className="mt-4 rounded-lg border border-line p-3">
              <p className="text-sm">Paused campaign {createdId}.</p>
              {!showLaunch ? (
                <button className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm" type="button" onClick={() => setShowLaunch(true)}>
                  Launch
                </button>
              ) : (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm" htmlFor="cg-confirm">
                    <input id="cg-confirm" type="checkbox" checked={confirmLaunch} onChange={(event) => setConfirmLaunch(event.target.checked)} />
                    I confirm this campaign should go live
                  </label>
                  <button className="btn-brand mt-3 min-h-11 rounded-full px-4 text-sm" type="button" disabled={!confirmLaunch} onClick={launch}>
                    Confirm launch
                  </button>
                </div>
              )}
            </div>
          ) : null}
          <label className="mt-6 block text-sm font-medium" htmlFor="cg-csv">
            Ads Manager CSV
          </label>
          <textarea id="cg-csv" className="mt-1 min-h-28 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm" value={csv} onChange={(event) => setCsv(event.target.value)} />
          <button className="mt-2 min-h-11 rounded-full border border-line px-4 text-sm" type="button" onClick={importCsv}>
            Import report
          </button>
        </section>
      ) : null}
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      <input id={id} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function split(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

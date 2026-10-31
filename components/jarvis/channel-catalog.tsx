"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BRAND_TAGLINE, BRAND_WORDMARK, PRODUCT_NAME } from "@/lib/brand";
import { Crumbs, End } from "./bits";

const end = { productName: PRODUCT_NAME, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE };
const CATEGORIES = ["All", "Social", "Search", "Video", "CTV", "Programmatic", "Other"];

export type CatalogCardModel = {
  key: string;
  name: string;
  clientLabel: string;
  aliases: string[];
  categoryLabel: string;
  auth: string;
  readOnly: string;
  idUpload: string;
  matchRate: string;
  status: string;
  contracted: boolean;
  vendor: string;
  colourToken: string;
  hierarchy: string;
  scopesRead: string[];
};

type Step = "choose" | "connect" | "capability" | "test";
type Outcome = "success" | "error" | "rate_limited" | "token_expired";

export function ChannelCatalog({
  cards,
  clients,
  accounts,
  canDecide,
  initialStep = "choose",
  initialPlatform = "linkedin",
  initialResult = "",
  showConnected = false,
  capabilities = {},
}: {
  cards: CatalogCardModel[];
  clients: { id: string; name: string }[];
  accounts: { clientId: string; id: string; name: string }[];
  canDecide: boolean;
  initialStep?: Step;
  initialPlatform?: string;
  initialResult?: string;
  showConnected?: boolean;
  capabilities?: Record<string, { items: { name: string; result: string }[]; matchNote: string }>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [connectedOn, setConnectedOn] = useState(showConnected);
  const [step, setStep] = useState<Step>(initialStep);
  const [platformKey, setPlatformKey] = useState(initialPlatform);
  const [clientId, setClientId] = useState(clients[0]?.id || "harbor");
  const [accountId, setAccountId] = useState("");
  const [secret, setSecret] = useState("");
  const [stored, setStored] = useState(false);
  const [phase, setPhase] = useState<"idle" | "testing" | "done">(initialResult ? "done" : "idle");
  const [outcome, setOutcome] = useState<Outcome>(initialResult === "error" || initialResult === "rate_limited" || initialResult === "token_expired" ? initialResult : "success");
  const [requests, setRequests] = useState<{ id: string; name: string; category: string; status: string; why: string }[]>([]);
  const [formError, setFormError] = useState("");
  const platform = cards.find((card) => card.key === platformKey) ?? cards.find((card) => card.key === "linkedin") ?? cards[0];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (!connectedOn && card.status === "Connected") return false;
      if (category !== "All" && card.categoryLabel !== category) return false;
      if (!q) return true;
      return [card.name, card.clientLabel, card.key, ...card.aliases].join(" ").toLowerCase().includes(q);
    });
  }, [cards, query, category, connectedOn]);
  const accountChoices = accounts.filter((account) => account.clientId === clientId);
  const selectedAccount = accountId || accountChoices[0]?.id || "";

  function openConnect(key: string) {
    setPlatformKey(key);
    setStep("connect");
    setStored(false);
    setSecret("");
    setPhase("idle");
  }

  function runTest(next: Outcome) {
    setOutcome(next);
    setPhase("testing");
    window.setTimeout(() => setPhase("done"), 400);
  }

  async function submitRequest(form: FormData) {
    setFormError("");
    const payload = {
      action: "request",
      name: String(form.get("name") || ""),
      category: String(form.get("category") || ""),
      docsLink: String(form.get("docsLink") || ""),
      clientId: String(form.get("clientId") || ""),
      why: String(form.get("why") || ""),
    };
    const response = await fetch("/api/marketing/channels/registry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; request?: { id: string; name: string; category: string; status: string; why: string } };
    if (!response.ok || !body.request) {
      setFormError(body.error || "Could not queue that request.");
      return;
    }
    setRequests((list) => [...list, body.request!]);
  }

  async function decide(id: string, decision: "approve" | "decline") {
    const response = await fetch("/api/marketing/channels/registry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "decide", id, decision }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setFormError(body.error || "Not allowed");
      return;
    }
    setRequests((list) => list.map((item) => (item.id === id ? { ...item, status: decision === "approve" ? "approved" : "declined" } : item)));
  }

  return (
    <main>
      <Crumbs items={[{ label: "Settings & connections", href: "/settings/connections" }, { label: "Add a channel or ad platform" }]} />
      <div className="top">
        <div>
          <div className="sub">Settings · Connections · Staff only</div>
          <h1>Add a channel or ad platform</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <ol className="tabs" aria-label="Steps">
        {(["choose", "connect", "capability", "test"] as const).map((item, index) => (
          <li key={item}>
            <button type="button" className="hit" aria-current={step === item ? "step" : undefined} onClick={() => setStep(item)}>
              {index + 1}. {item === "choose" ? "Choose" : item === "connect" ? "Connect" : item === "capability" ? "Capability check" : "Test connection"}
            </button>
          </li>
        ))}
      </ol>

      {step === "choose" && (
        <section aria-labelledby="choose-title">
          <h2 id="choose-title">Choose</h2>
          <div className="field">
            <label htmlFor="platform-search">Search platforms</label>
            <input id="platform-search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          </div>
          <div className="filters" role="group" aria-label="Category">
            {CATEGORIES.map((item) => (
              <button key={item} type="button" className="btn hit" aria-pressed={category === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
            <button type="button" className="btn hit" aria-pressed={connectedOn} onClick={() => setConnectedOn((value) => !value)}>
              Show connected
            </button>
          </div>
          <p className="live" aria-live="polite">
            {shown.length} {shown.length === 1 ? "platform" : "platforms"}
          </p>
          <div className="cardgrid">
            {shown.map((card) => (
              <article key={card.key} className="pcard">
                <div className="tag" style={{ color: card.colourToken }}>{card.categoryLabel}</div>
                <h3>{card.name}</h3>
                <p>{card.auth}</p>
                <p>{card.readOnly}</p>
                <p>{card.idUpload}</p>
                <p>{card.matchRate}</p>
                <p className={card.status === "Connected" ? "st ok" : "st w"}>
                  <span aria-hidden="true">{card.status === "Connected" ? "●" : card.status === "Needs reconnect" ? "▲" : "○"}</span> {card.status}
                </p>
                {!card.contracted && <p>No contract yet</p>}
                <button type="button" className="btn p hit" onClick={() => openConnect(card.key)}>
                  Connect {card.name}
                </button>
              </article>
            ))}
          </div>
          <section className="box" style={{ marginTop: 20 }} aria-labelledby="request-title">
            <h2 id="request-title">Request a platform not listed</h2>
            <form
              className="field"
              onSubmit={(event) => {
                event.preventDefault();
                void submitRequest(new FormData(event.currentTarget));
                event.currentTarget.reset();
              }}
            >
              <label htmlFor="req-name">Platform name</label>
              <input id="req-name" name="name" required />
              <label htmlFor="req-category">Category</label>
              <select id="req-category" name="category" defaultValue="social">
                {CATEGORIES.filter((item) => item !== "All").map((item) => (
                  <option key={item} value={item.toLowerCase() === "ctv" ? "ctv" : item.toLowerCase()}>
                    {item}
                  </option>
                ))}
              </select>
              <label htmlFor="req-docs">Docs link (optional)</label>
              <input id="req-docs" name="docsLink" type="url" placeholder="https://" />
              <label htmlFor="req-client">Client</label>
              <select id="req-client" name="clientId" defaultValue={clients[0]?.id}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
              <label htmlFor="req-why">Why</label>
              <textarea id="req-why" name="why" required rows={3} />
              <button type="submit" className="btn p hit">Queue request</button>
            </form>
            {formError && <p role="alert">{formError}</p>}
            <h3>Internal queue</h3>
            {requests.length === 0 ? <p className="sub">No requests yet. Nothing is sent outside the app.</p> : (
              <ul>
                {requests.map((item) => (
                  <li key={item.id}>
                    {item.name} · {item.category} · {item.status}
                    {canDecide && item.status === "queued" && (
                      <span className="acts">
                        <button type="button" className="btn hit" onClick={() => void decide(item.id, "approve")}>Approve</button>
                        <button type="button" className="btn hit" onClick={() => void decide(item.id, "decline")}>Decline</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      )}

      {step === "connect" && platform && (
        <section aria-labelledby="connect-title">
          <h2 id="connect-title">Connect {platform.name}</h2>
          <div className="field">
            <label htmlFor="connect-client">Client</label>
            <select id="connect-client" value={clientId} onChange={(event) => { setClientId(event.target.value); setAccountId(""); }}>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <label htmlFor="connect-account">Ad account</label>
            <select id="connect-account" value={selectedAccount} onChange={(event) => setAccountId(event.target.value)}>
              {accountChoices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </div>
          {platform.auth === "OAuth" ? (
            <div className="field">
              <a className="btn p hit" href={`/settings/connections/oauth?platform=${platform.key}`} target="_blank" rel="noopener noreferrer">
                Open {platform.name} in a new window
              </a>
              <p className="sub">Read-only scopes: {platform.scopesRead.join(", ")}</p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="api-key">API key or token</label>
              <input
                id="api-key"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
              />
              <button
                type="button"
                className="btn hit"
                onClick={() => {
                  if (!secret.trim()) return;
                  setSecret("");
                  setStored(true);
                }}
              >
                Store encrypted
              </button>
              {stored && <p role="status">Stored encrypted. The key will not be shown again.</p>}
            </div>
          )}
          <table className="stack">
            <thead><tr><th>Access</th><th>Setting</th></tr></thead>
            <tbody>
              <tr><td data-label="Access">Read</td><td data-label="Setting">On</td></tr>
              <tr><td data-label="Access">Ad-account writes</td><td data-label="Setting">Off, dry run only, <span className="pill t">PENDING JASON APPROVAL</span></td></tr>
              <tr><td data-label="Access">Auto-pause</td><td data-label="Setting">Dry run until Jason approves this platform</td></tr>
              <tr><td data-label="Access">Writes</td><td data-label="Setting">Dry run until Jason approves this platform</td></tr>
              <tr><td data-label="Access">Auto-resume</td><td data-label="Setting">Dry run until Jason approves this platform</td></tr>
            </tbody>
          </table>
          <p>Bots only recommend budget changes.</p>
          <button type="button" className="btn p hit" onClick={() => setStep("capability")}>Continue to capability check</button>
        </section>
      )}

      {step === "capability" && platform && (
        <section aria-labelledby="cap-title">
          <h2 id="cap-title">Capability check</h2>
          <p className="sub">{platform.name} · {platform.hierarchy || "Account"}</p>
          <ul>
            {(capabilities[platform.key]?.items ?? []).map((item) => (
              <li key={item.name}>
                {item.name}: <span className={item.result === "supported" ? "st ok" : item.result === "partial" ? "st w" : "st e"}><span aria-hidden="true">{item.result === "supported" ? "●" : item.result === "partial" ? "▲" : "✕"}</span> {item.result}</span>
              </li>
            ))}
          </ul>
          <p>{capabilities[platform.key]?.matchNote}</p>
          <button type="button" className="btn p hit" onClick={() => setStep("test")}>Continue to test connection</button>
        </section>
      )}

      {step === "test" && platform && (
        <section aria-labelledby="test-title">
          <h2 id="test-title">Test connection</h2>
          <p className="sub">Pulls a small sample. Mock mode does not call {platform.name}.</p>
          <button type="button" className="btn p hit" onClick={() => runTest("success")}>Test connection</button>
          <div className="acts">
            <button type="button" className="btn hit" onClick={() => runTest("error")}>Preview an error</button>
            <button type="button" className="btn hit" onClick={() => runTest("rate_limited")}>Preview rate limit</button>
            <button type="button" className="btn hit" onClick={() => runTest("token_expired")}>Preview token expired</button>
          </div>
          <p aria-live="polite">{phase === "testing" ? "Checking access (up to 30 s)" : ""}</p>
          {phase === "done" && outcome === "success" && (
            <p role="status">3 campaigns read. Read only. first full sync within 24 h. The platform then appears everywhere automatically.</p>
          )}
          {phase === "done" && outcome === "error" && (
            <div role="alert">
              <p>The sample read was refused.</p>
              <p>Check the ad account id and use a read-only key, then retry.</p>
              <p>Nothing was saved.</p>
              <div className="acts">
                <button type="button" className="btn p hit" onClick={() => runTest("error")}>Retry</button>
                <button type="button" className="btn hit" onClick={() => { setStep("connect"); setPhase("idle"); }}>Use different account</button>
                <button type="button" className="btn hit" onClick={() => void navigator.clipboard?.writeText("The sample read was refused. Check the ad account id and use a read-only key, then retry.")}>Copy error details</button>
              </div>
            </div>
          )}
          {phase === "done" && outcome === "rate_limited" && (
            <p role="status">Rate limited. This check will retry automatically. Nothing was saved.</p>
          )}
          {phase === "done" && outcome === "token_expired" && (
            <p role="alert">Needs reconnect. Use Reconnect on the Connections row. <Link href="/settings/connections">Back to Connections</Link></p>
          )}
        </section>
      )}
      <End {...end} />
    </main>
  );
}

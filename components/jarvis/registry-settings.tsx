"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BRAND_TAGLINE, BRAND_WORDMARK, PRODUCT_NAME } from "@/lib/brand";
import { Crumbs, End } from "./bits";

const end = { productName: PRODUCT_NAME, wordmark: BRAND_WORDMARK, tagline: BRAND_TAGLINE };

export type SettingsRowModel = {
  key: string;
  label: string;
  status: string;
  access: string;
  writeLabel: string;
  canDisconnect: boolean;
};

export function RegistrySettings({
  headline,
  rows,
  disconnectKey = "",
  dateLabel,
}: {
  headline: string;
  rows: SettingsRowModel[];
  disconnectKey?: string;
  dateLabel: string;
}) {
  const initial = rows.find((row) => row.key === disconnectKey && row.canDisconnect) ?? null;
  const [target, setTarget] = useState<SettingsRowModel | null>(initial);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!target) return;
    keepRef.current?.focus();
    const node = dialogRef.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setTarget(null);
        setTyped("");
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll<HTMLElement>("button, input, a, select, textarea")].filter((item) => !item.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target]);

  function keep() {
    setTarget(null);
    setTyped("");
  }

  return (
    <main>
      <Crumbs items={[{ label: "Harbor Dental", href: "/" }, { label: "Settings & connections" }]} />
      <div className="top">
        <div>
          <div className="sub">Account · Settings & connections</div>
          <h1>{headline}</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p>
        <Link className="btn p hit" href="/settings/connections/add">Add a channel or ad platform</Link>
      </p>
      <table className="stack">
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th>Access</th>
            <th>Write access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td data-label="Source">{row.label}</td>
              <td data-label="Status">
                <span className={row.status === "Connected" ? "st ok" : row.status === "Needs reconnect" ? "st e" : "st w"}>
                  <span aria-hidden="true">{row.status === "Connected" ? "●" : row.status === "Needs reconnect" ? "▲" : "○"}</span> {row.status}
                </span>
                {row.status === "Needs reconnect" && (
                  <Link className="btn hit" href={`/settings/connections/add?step=connect&platform=${row.key}`}>Reconnect</Link>
                )}
              </td>
              <td data-label="Access">{row.access}</td>
              <td data-label="Write access">
                {row.writeLabel === "PENDING JASON APPROVAL" ? <span className="pill t">PENDING JASON APPROVAL</span> : row.writeLabel}
                {row.canDisconnect && (
                  <button type="button" className="btn hit" onClick={() => { setNote(""); setTyped(""); setTarget(row); }}>
                    Disconnect
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p role="status">{note}</p>}
      <p className="sub">Write access can only pause ads on a down page, and only after approval. It cannot change budgets. Bots only recommend budget changes.</p>
      {target && (
        <div className="modal-back">
          <div ref={dialogRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="disconnect-title">
            <form
              className="sheet-body"
              onSubmit={(event) => {
                event.preventDefault();
                if (typed.trim() !== target.label) return;
                setNote(`${target.label} disconnected ${dateLabel}. Syncing stopped. The token was revoked and deleted. Past data stays. Audiences on the platform were not deleted. Nothing changed in the ad account.`);
                keep();
              }}
            >
              <h2 id="disconnect-title">Disconnect {target.label}?</h2>
              <ul>
                <li>Syncing stops.</li>
                <li>Past data stays, marked “disconnected {dateLabel}”.</li>
                <li>Audiences already on the platform are not deleted.</li>
                <li>Nothing changes in the ad account.</li>
                <li>The token is revoked and deleted.</li>
                <li>{target.label} leaves Audience Data and Resolution for this client.</li>
              </ul>
              <label htmlFor="confirm-name">Type {target.label} to confirm</label>
              <input id="confirm-name" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
              <div className="acts">
                <button ref={keepRef} type="button" className="btn p hit" onClick={keep}>Keep connected</button>
                <button type="submit" className="btn hit" disabled={typed.trim() !== target.label}>Disconnect</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <End {...end} />
    </main>
  );
}

export function ClientConnectionList({ channels }: { channels: { label: string }[] }) {
  return (
    <main>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Connections" }]} />
      <div className="top">
        <div>
          <div className="sub">Your connected channels</div>
          <h1>Connected channels</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      {channels.length === 0 ? <p>No channels are connected yet.</p> : (
        <ul>
          {channels.map((channel) => (
            <li key={channel.label}>{channel.label}</li>
          ))}
        </ul>
      )}
      <End {...end} />
    </main>
  );
}

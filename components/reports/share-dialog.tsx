"use client";

import { useEffect, useId, useState } from "react";
import { REPORT_MOTION } from "@/lib/marketing/reports/motion";

type LinkRow = { id: string; label: string; views: number; expires: string; passcode: boolean };

function mintCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

function pretty(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function expiryChoice(days: number) {
  const when = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(when);
  return `${days} days · ${label}`;
}

export function ShareDialog({
  open,
  onClose,
  query,
  canStaffPdf,
  pdfDefault,
  reduce,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  canStaffPdf: boolean;
  pdfDefault: "staff" | "client";
  reduce: boolean;
  onToast: (message: string) => void;
}) {
  if (!open) return null;
  return (
    <ShareDialogBody
      query={query}
      canStaffPdf={canStaffPdf}
      pdfDefault={pdfDefault}
      reduce={reduce}
      onClose={onClose}
      onToast={onToast}
    />
  );
}

function ShareDialogBody({
  query,
  canStaffPdf,
  pdfDefault,
  reduce,
  onClose,
  onToast,
}: {
  query: string;
  canStaffPdf: boolean;
  pdfDefault: "staff" | "client";
  reduce: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [days, setDays] = useState(30);
  const [view, setView] = useState<"client" | "staff">(pdfDefault);
  const [passcodeOn, setPasscodeOn] = useState(true);
  const [code, setCode] = useState(mintCode);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    void fetch("/api/marketing/reports/share", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!dead && res.ok) setLinks(data.links || []);
      })
      .catch(() => {
        if (!dead) setError("Links could not be loaded.");
      });
    return () => {
      dead = true;
    };
  }, []);

  const close = () => {
    if (reduce) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, REPORT_MOTION.dialogCloseMs);
  };

  const create = async () => {
    setBusy(true);
    setError("");
    const response = await fetch("/api/marketing/reports/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, passcode: passcodeOn ? code : "", query }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "Could not create the link");
      return;
    }
    setUrl(data.url);
    if (data.passcode) setCode(data.passcode);
    setLinks((current) => [{ id: data.id, label: data.label, views: 0, expires: data.expires, passcode: Boolean(data.passcode) }, ...current]);
    onToast("Link created");
  };

  const revoke = async (id: string) => {
    const response = await fetch("/api/marketing/reports/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      setError("Could not revoke that link");
      return;
    }
    setLinks((current) => current.filter((link) => link.id !== id));
    onToast("Link turned off");
  };

  const download = async () => {
    onToast("Building your report…");
    const params = new URLSearchParams(query);
    params.set("view", canStaffPdf ? view : "client");
    const response = await fetch(`/api/marketing/reports/export?${params.toString()}`);
    if (!response.ok) {
      onToast("Could not build the PDF. Retry");
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "jarvis-report.pdf";
    anchor.click();
    URL.revokeObjectURL(href);
    onToast("Report ready");
  };

  return (
    <div className="jr-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        className={`jr-dialog ${closing ? "closing" : "open"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}
      >
        <div className="jr-ph">
          <h2 id={titleId}>Share this report</h2>
          <span className="jr-ex">EXAMPLE DATA</span>
        </div>
        <p className="jr-sub">Client view · cost metrics are removed on the server, including in the PDF.</p>
        <div className="jr-field">
          <span className="jr-kicker">Link</span>
          <div className="jr-linkrow">
            <input readOnly value={url} placeholder="Create a link to copy it" aria-label="Share link" />
            <button
              type="button"
              className="jr-btn"
              onClick={() => {
                if (!url) return;
                void navigator.clipboard.writeText(url);
                onToast("Link copied");
              }}
            >
              Copy link
            </button>
          </div>
        </div>
        <div className="jr-split">
          <div className="jr-field">
            <label htmlFor="jr-exp">Expires</label>
            <select id="jr-exp" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              {[7, 30, 90].map((option) => <option key={option} value={option}>{expiryChoice(option)}</option>)}
            </select>
          </div>
          <div className="jr-field">
            <label htmlFor="jr-view">View</label>
            <select id="jr-view" value={view} onChange={(event) => setView(event.target.value === "staff" ? "staff" : "client")}>
              <option value="client">Client (no cost)</option>
              {canStaffPdf && <option value="staff">Staff</option>}
            </select>
          </div>
        </div>
        <div className="jr-switch">
          <div>
            <strong>Require passcode</strong>
            <div className="jr-sub">6-digit code, sent separately</div>
          </div>
          <button type="button" role="switch" aria-checked={passcodeOn} aria-label="Require passcode" onClick={() => setPasscodeOn((on) => !on)}>
            <i />
          </button>
        </div>
        {passcodeOn && (
          <div className="jr-linkrow" style={{ marginTop: 8 }}>
            <div className="jr-code" aria-label="Passcode">{pretty(code)}</div>
            <button type="button" className="jr-btn" onClick={() => setCode(mintCode())}>Regenerate</button>
          </div>
        )}
        <p className="jr-attr">Hidden from search engines (noindex). Every view is logged. The link is a snapshot of the client view.</p>
        {error && <p className="jr-delta bad">{error}</p>}
        <div className="jr-links">
          <div className="jr-ph"><h3 style={{ fontSize: 14 }}>Active links ({links.length})</h3></div>
          {links.map((link) => (
            <div key={link.id} className="jr-linkitem">
              <span>{link.label} · {link.views} views · {link.expires}{link.passcode ? " · passcode" : ""}</span>
              <button type="button" className="jr-revoke" onClick={() => void revoke(link.id)}>Revoke</button>
            </div>
          ))}
          {!links.length && <p className="jr-sub">No active links yet.</p>}
        </div>
        <div className="jr-actions">
          <button type="button" className="jr-btn" onClick={close}>Cancel</button>
          <button type="button" className="jr-btn" onClick={() => void download()}>Download PDF</button>
          <button type="button" className="jr-btn primary" disabled={busy} onClick={() => void create()}>Create link</button>
        </div>
      </div>
    </div>
  );
}

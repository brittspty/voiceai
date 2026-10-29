"use client";

import { useState } from "react";

export function ShareLinkButton() {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-2 text-sm"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/marketing/share-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: form.get("label"), expiresAt: form.get("expiresAt"), passcode: form.get("passcode") }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error || "Could not create the link");
          return;
        }
        setLink(data.url);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input name="label" placeholder="Label" className="h-9 rounded-lg border border-line px-2" />
        <input name="expiresAt" type="date" className="h-9 rounded-lg border border-line px-2" aria-label="Expiry date" />
        <input name="passcode" inputMode="numeric" placeholder="Optional code" className="h-9 rounded-lg border border-line px-2" aria-label="Optional passcode" />
        <button className="h-9 rounded-full bg-ink px-3 text-on-ink">Create link</button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {link && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all text-muted">{link}</p>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand"
            onClick={() => void navigator.clipboard.writeText(link)}
          >
            Copy
          </button>
        </div>
      )}
    </form>
  );
}

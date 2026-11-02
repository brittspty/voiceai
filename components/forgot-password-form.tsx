"use client";

import { useState } from "react";

export function ForgotPasswordForm({ emailSends }: { emailSends: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setMessage(null);
        const data = new FormData(event.currentTarget);
        const res = await fetch("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: data.get("email") }),
        });
        const body = await res.json().catch(() => ({}));
        setPending(false);
        if (!res.ok) {
          setError(body.error || "Could not start a reset.");
          return;
        }
        setMessage(body.message || "If that email has an account, password help is on its way.");
      }}
    >
      <label className="block text-sm">Work email
        <input name="email" type="email" required autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <button disabled={pending} className="btn-brand h-10 w-full rounded-full text-sm">{pending ? "Sending…" : "Send reset link"}</button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {message && <p className="text-sm" role="status">{message}</p>}
      {!emailSends && <p className="text-sm text-muted">Email is not being sent from this server yet. The request is recorded, and support can still help.</p>}
    </form>
  );
}

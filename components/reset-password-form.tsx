"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : "This reset link is no longer valid. Ask for a new one.");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const data = new FormData(event.currentTarget);
        const res = await fetch("/api/auth/password-reset/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: data.get("password") }),
        });
        const body = await res.json().catch(() => ({}));
        setPending(false);
        if (!res.ok) {
          setError(body.error || "Could not reset the password.");
          return;
        }
        router.push("/login");
        router.refresh();
      }}
    >
      <label className="block text-sm">New password
        <input name="password" type="password" required autoComplete="new-password" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <button disabled={pending || !token} className="btn-brand h-10 w-full rounded-full text-sm">{pending ? "Saving…" : "Save password"}</button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </form>
  );
}

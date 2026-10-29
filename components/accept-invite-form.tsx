"use client";

import Link from "next/link";
import { useState } from "react";
import { acceptInvite } from "@/lib/actions";

export function AcceptInviteForm({ token, wordmark }: { token: string; wordmark: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold">Join {wordmark}</h1>
        {done ? (
          <p className="mt-4 text-sm">Your password is set. <Link className="underline" href="/login">Sign in</Link></p>
        ) : (
          <form
            className="mt-4 space-y-3"
            action={async (formData) => {
              setError(null);
              const password = String(formData.get("password") || "");
              const confirm = String(formData.get("confirm") || "");
              if (password !== confirm) {
                setError("Those passwords don't match.");
                return;
              }
              try {
                await acceptInvite({ token, password });
                setDone(true);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Could not accept the invite.");
              }
            }}
          >
            <label className="block text-sm">Password
              <input name="password" type="password" required autoComplete="new-password" minLength={10} className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
            </label>
            <label className="block text-sm">Confirm password
              <input name="confirm" type="password" required autoComplete="new-password" minLength={10} className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button className="btn-brand h-10 w-full rounded-full text-sm">Set password</button>
          </form>
        )}
      </div>
    </main>
  );
}

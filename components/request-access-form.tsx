"use client";

import { useState } from "react";
import Link from "next/link";
import { requestAccess } from "@/lib/actions";

export function RequestAccessForm({ wordmark, tagline }: { wordmark: string; tagline: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-12">
      <p className="text-sm text-muted"><Link href="/login" className="underline">{wordmark}</Link></p>
      <h1 className="mt-3 text-3xl font-semibold">Request access</h1>
      <p className="mt-2 text-sm italic text-zinc-600">{tagline}</p>
      {done ? (
        <p className="mt-6 text-sm leading-6" role="status">Thanks. We have your request and will reply within 1 business day.</p>
      ) : (
        <form
          className="mt-6 space-y-3"
          action={async (formData) => {
            setError(null);
            try {
              await requestAccess({
                name: String(formData.get("name") || ""),
                email: String(formData.get("email") || ""),
                business: String(formData.get("business") || ""),
              });
              setDone(true);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not save your request.");
            }
          }}
        >
          <label className="block text-sm">Name
            <input name="name" required autoComplete="name" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
          </label>
          <label className="block text-sm">Work email
            <input name="email" type="email" required autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
          </label>
          <label className="block text-sm">Business
            <input name="business" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-brand h-10 rounded-full px-4 text-sm">Request access</button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
    </main>
  );
}

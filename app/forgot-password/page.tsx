"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        {!sent ? (
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); setSent(true); }}>
            <label className="block text-sm">Email
              <input name="email" type="email" required autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
            </label>
            <button className="h-10 w-full rounded-full bg-ink text-sm text-white">Request a reset</button>
          </form>
        ) : (
          <p className="mt-4 text-sm leading-6 text-zinc-700">Email support@specificityinc.com from that address. If it has an account, Specificity will send a reset link within 1 business day.</p>
        )}
        <p className="mt-4 text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { beginTotp, confirmTotp, disableTotp } from "@/lib/actions";

export function TotpSetup({ enabled, userId }: { enabled: boolean; userId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <h3 className="font-medium">Your two-step sign-in</h3>
      <p className="mt-1 text-sm text-muted">{enabled ? "Two-step sign-in is on for this account." : "Add a six-digit code from an authenticator app."}</p>
      {error && <p className="mt-2 text-sm text-[#d14343]">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!enabled && !qr && <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black" onClick={async () => {
          try { const next = await beginTotp(); setQr(next.qr); setSecret(next.secret); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start"); }
        }}>Set up</button>}
        {qr && (
          <form className="flex flex-wrap items-center gap-3" action={async (formData) => { try { await confirmTotp(String(formData.get("code") || "")); location.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not confirm"); } }}>
            <img src={qr} alt="Two-step QR code" className="h-28 w-28 rounded-md border border-line" />
            <div>
              <div className="font-mono text-xs">{secret}</div>
              <input name="code" inputMode="numeric" placeholder="123456" className="mt-2 h-9 rounded-lg border border-line px-2 text-sm" />
              <button className="ml-2 rounded-full bg-ink px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black">Confirm</button>
            </div>
          </form>
        )}
        {enabled && <form action={async () => { await disableTotp(userId); location.reload(); }}><button className="text-sm underline">Turn off</button></form>}
      </div>
    </div>
  );
}

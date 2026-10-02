"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#2563eb] text-sm font-semibold text-white">V</div>
          <div>
            <div className="text-sm font-semibold">Voice Operations</div>
            <div className="text-xs text-muted">Specificity Inc</div>
          </div>
        </div>
        {!ticket ? (
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(null);
              const form = new FormData(event.currentTarget);
              const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
              });
              const data = await res.json();
              setPending(false);
              if (!res.ok) { setError(data.error || "Could not sign in"); return; }
              if (data.totpRequired) { setTicket(data.ticket); return; }
              router.push("/");
              router.refresh();
            }}
          >
            <label className="block text-sm">Email<input name="email" type="email" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
            <label className="block text-sm">Password<input name="password" type="password" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
            {error && <p className="text-sm text-[#d14343]">{error}</p>}
            <button disabled={pending} className="h-10 w-full rounded-full bg-ink text-sm text-white dark:bg-white dark:text-black">Continue</button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(null);
              const form = new FormData(event.currentTarget);
              const res = await fetch("/api/auth/totp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticket, code: form.get("code") }),
              });
              const data = await res.json();
              setPending(false);
              if (!res.ok) { setError(data.error || "Could not verify"); return; }
              router.push("/");
              router.refresh();
            }}
          >
            <p className="text-sm text-muted">Enter the six-digit code from your authenticator app.</p>
            <input name="code" inputMode="numeric" required className="h-10 w-full rounded-lg border border-line px-3 tracking-[0.3em]" />
            {error && <p className="text-sm text-[#d14343]">{error}</p>}
            <button disabled={pending} className="h-10 w-full rounded-full bg-ink text-sm text-white dark:bg-white dark:text-black">Verify</button>
          </form>
        )}
        <div className="mt-5 rounded-lg bg-chip p-3 text-xs text-muted">
          <div>Demo owner: alex.rivera@capitalfinancial.example</div>
          <div>Password: VoiceOps!owner</div>
          <div className="mt-1">Admin with two-step: jordan.lee@capitalfinancial.example · secret JBSWY3DPEHPK3PXP</div>
        </div>
      </div>
    </div>
  );
}

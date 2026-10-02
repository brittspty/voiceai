"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { PRODUCT_NAME } from "@/lib/client-config";

export type LoginBrand = {
  companyName: string;
  brandColor: string;
  logoUrl: string;
  mark: string;
};

export type DemoHint = {
  ownerEmail: string;
  ownerPassword: string | null;
  adminEmail: string;
};

export function LoginScreen({ brand, hint }: { brand: LoginBrand; hint: DemoHint | null }) {
  return (
    <Suspense>
      <LoginForm brand={brand} hint={hint} />
    </Suspense>
  );
}

function LoginForm({ brand, hint }: { brand: LoginBrand; hint: DemoHint | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryError = params.get("error") === "credentials" ? "Email or password is wrong." : params.get("error") === "rate" ? "Too many attempts. Wait a few minutes and try again." : params.get("error") === "totp" ? "This account needs the in-app two-step step. Sign in from this page after it finishes loading." : null;
  const [error, setError] = useState<string | null>(queryError);
  const [ticket, setTicket] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-5 flex items-center gap-2.5">
          <BrandMark brandColor={brand.brandColor} logoUrl={brand.logoUrl} mark={brand.mark} letter />
          <div>
            <div className="text-sm font-semibold">{PRODUCT_NAME}</div>
            <div className="text-xs text-muted">{brand.companyName}</div>
          </div>
        </div>
        {!ticket ? (
          <form
            className="space-y-3"
            method="post"
            action="/api/auth/login"
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
        {hint && (
          <div className="mt-5 rounded-lg bg-chip p-3 text-xs text-muted">
            <div>Demo owner: {hint.ownerEmail}</div>
            {hint.ownerPassword && <div>Password: {hint.ownerPassword}</div>}
            <div className="mt-1">Admin: {hint.adminEmail}</div>
          </div>
        )}
      </div>
    </div>
  );
}

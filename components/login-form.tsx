"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { sameOriginPath } from "@/lib/same-origin-path";

export type LoginBrand = {
  companyName: string;
  brandColor: string;
  logoUrl: string;
  mark: string;
  wordmark: string;
  tagline: string;
  productLine: string;
};

export type DemoHint = {
  ownerEmail: string;
  ownerPassword: string | null;
  adminEmail: string;
};

export function LoginScreen({ brand, hint, homeHref = "/" }: { brand: LoginBrand; hint: DemoHint | null; homeHref?: string }) {
  return (
    <Suspense>
      <LoginForm brand={brand} hint={hint} homeHref={homeHref} />
    </Suspense>
  );
}

function LoginForm({ brand, hint, homeHref }: { brand: LoginBrand; hint: DemoHint | null; homeHref: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryError = params.get("error") === "credentials" ? "Email or password is wrong." : params.get("error") === "rate" ? "Too many attempts. Wait a few minutes and try again." : params.get("error") === "totp" ? "This account needs the in-app two-step step. Sign in from this page after it finishes loading." : null;
  const [error, setError] = useState<string | null>(queryError);
  const [ticket, setTicket] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-5">
          <div className="flex items-center gap-2.5">
            <BrandMark brandColor={brand.brandColor} logoUrl={brand.logoUrl} mark={brand.mark} letter alt={brand.wordmark} />
            <div>
              <h1 className="text-sm font-semibold">Sign in to {brand.wordmark}</h1>
              <p className="text-xs italic text-zinc-600 dark:text-zinc-300">{brand.tagline}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{brand.productLine}</p>
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
              router.push(sameOriginPath(data.next, homeHref));
              router.refresh();
            }}
          >
            <label className="block text-sm">Email<input name="email" type="email" autoComplete="email" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
            <label className="block text-sm">Password<input name="password" type="password" autoComplete="current-password" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
            <p className="text-sm"><Link href="/forgot-password" className="underline">Forgot password?</Link></p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button disabled={pending} className="btn-brand h-10 w-full rounded-full text-sm">{pending ? "Signing in…" : "Sign in"}</button>
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
              router.push(sameOriginPath(data.next, homeHref));
              router.refresh();
            }}
          >
            <p className="text-sm text-muted">Enter the six-digit code from your authenticator app.</p>
            <input name="code" inputMode="numeric" required className="h-10 w-full rounded-lg border border-line px-3 tracking-[0.3em]" />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button disabled={pending} className="btn-brand h-10 w-full rounded-full text-sm">Verify</button>
          </form>
        )}
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">New to {brand.wordmark}? <Link href="/contact" className="font-medium underline">Request access</Link>. We&apos;ll set you up within 1 business day.</p>
        {hint && (
          <div className="mt-5 rounded-lg bg-chip p-3 text-xs text-muted">
            <div>Demo owner: {hint.ownerEmail}</div>
            {hint.ownerPassword && <div>Password: {hint.ownerPassword}</div>}
            <div className="mt-1">Admin: {hint.adminEmail}</div>
          </div>
        )}
        <p className="mt-5 text-xs text-zinc-600 dark:text-zinc-300">© {brand.wordmark} · {brand.tagline} · <Link className="underline" href="/privacy">Privacy</Link> · <Link className="underline" href="/terms">Terms</Link> · <Link className="underline" href="/contact">Support</Link></p>
      </div>
    </div>
  );
}

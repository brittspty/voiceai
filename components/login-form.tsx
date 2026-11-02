"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { loginHeading } from "@/lib/login-copy";
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

export function LoginScreen({ brand, hint, homeHref = "/", magicLink = false, magicLinkDelivery = false, launchGaps = false }: { brand: LoginBrand; hint: DemoHint | null; homeHref?: string; magicLink?: boolean; magicLinkDelivery?: boolean; launchGaps?: boolean }) {
  return (
    <Suspense>
      <LoginForm brand={brand} hint={hint} homeHref={homeHref} magicLink={magicLink} magicLinkDelivery={magicLinkDelivery} launchGaps={launchGaps} />
    </Suspense>
  );
}

function LoginForm({ brand, hint, homeHref, magicLink, magicLinkDelivery, launchGaps }: { brand: LoginBrand; hint: DemoHint | null; homeHref: string; magicLink: boolean; magicLinkDelivery: boolean; launchGaps: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const queryError = params.get("error") === "credentials" ? "Email or password is wrong." : params.get("error") === "rate" ? "Too many attempts. Wait a few minutes and try again." : params.get("error") === "totp" ? "This account needs the in-app two-step step. Sign in from this page after it finishes loading." : null;
  const heading = loginHeading(params.get("audience"), brand.wordmark);
  const team = params.get("audience") === "team";
  const [error, setError] = useState<string | null>(queryError);
  const [notice, setNotice] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-5">
          <div className="flex items-center gap-2.5">
            <BrandMark brandColor={brand.brandColor} logoUrl={brand.logoUrl} mark={brand.mark} letter alt={brand.wordmark} />
            <div>
              <h1 className="text-base font-semibold">{heading}</h1>
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
            {launchGaps ? (
              <p className="text-sm">Forgot your password? Ask your Specificity admin to reset it.</p>
            ) : (
              <p className="text-sm"><Link href="/forgot-password" className="underline">Forgot password?</Link></p>
            )}
            {team && !launchGaps && <p className="text-sm text-muted">Company sign-in isn&apos;t connected. Use your email and password, or email support@specificityinc.com.</p>}
            {launchGaps && (
              <div>
                <button type="button" aria-disabled="true" aria-describedby="team-login-reason" className="text-sm underline" onClick={(event) => event.preventDefault()}>
                  Team login
                </button>
                <p id="team-login-reason" className="text-sm text-muted">Team login isn&apos;t available yet. Ask your Specificity admin to get you signed in.</p>
              </div>
            )}
            {magicLink && magicLinkDelivery && (
              <button
                type="button"
                className="text-sm underline"
                onClick={async (event) => {
                  const form = event.currentTarget.form;
                  const email = String(new FormData(form ?? undefined).get("email") || "");
                  setPending(true);
                  setError(null);
                  const res = await fetch("/api/auth/magic-link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                  });
                  const data = await res.json().catch(() => ({}));
                  setPending(false);
                  setError(res.ok ? null : data.error || "Could not start email sign-in.");
                  if (res.ok) setError(null);
                  if (res.ok) setNotice(data.message || "If that work email has an account, a sign-in link is on its way.");
                }}
              >
                Email me a sign-in link instead
              </button>
            )}
            {launchGaps && !magicLinkDelivery && (
              <div>
                <button type="button" aria-disabled="true" aria-describedby="magic-link-reason" className="text-sm underline" onClick={(event) => event.preventDefault()}>
                  Email me a sign-in link
                </button>
                <p id="magic-link-reason" className="text-sm text-muted">Email sign-in links are paused for launch. Sign in with your password, or ask your Specificity admin for help.</p>
              </div>
            )}
            {!launchGaps && magicLink && !magicLinkDelivery && <p className="text-sm text-muted">Email sign-in links are not being sent yet. Use your password, or email support@specificityinc.com.</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            {notice && <p className="text-sm" role="status">{notice}</p>}
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

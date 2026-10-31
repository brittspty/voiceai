"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState, type KeyboardEvent } from "react";
import { analyticsThemeCss } from "@/lib/brand/tokens";
import { countUpValue, loginFrameClass, nextLoginTab, type LoginTab, type PublicFigure, type PublicLoginAnalytics } from "@/lib/login-analytics";
import { MAGIC_LINK_READY, WORK_EMAIL_ERROR, workEmailError } from "@/lib/magic-link";
import { sameOriginPath } from "@/lib/same-origin-path";
import type { DemoHint, LoginBrand } from "./login-form";

const TABS: { id: LoginTab; label: string; panel: string }[] = [
  { id: "client", label: "Client login", panel: "panel-client" },
  { id: "team", label: "Team login", panel: "panel-team" },
];

export function LoginAnalyticsScreen({
  brand,
  hint,
  homeHref = "/",
  audience = "client",
  magicLink = false,
  initial = null,
}: {
  brand: LoginBrand;
  hint: DemoHint | null;
  homeHref?: string;
  audience?: LoginTab;
  magicLink?: boolean;
  initial?: PublicLoginAnalytics | null;
}) {
  const [failed, setFailed] = useState(!initial);
  const fail = useCallback(() => setFailed(true), []);
  return (
    <div className={`jarvis-dark ${loginFrameClass(failed)}`}>
      <style dangerouslySetInnerHTML={{ __html: analyticsThemeCss() }} />
      <LoginColumn brand={brand} hint={hint} homeHref={homeHref} audience={audience} centered={failed} magicLink={magicLink} />
      {!failed && (
        <div className="border-t border-line px-6 py-8 min-[701px]:border-t-0 min-[701px]:border-l min-[701px]:px-12 min-[701px]:py-12">
          <AnalyticsPanel onFail={fail} initial={initial} />
        </div>
      )}
    </div>
  );
}

function LoginColumn({
  brand,
  hint,
  homeHref,
  audience,
  centered,
  magicLink,
}: {
  brand: LoginBrand;
  hint: DemoHint | null;
  homeHref: string;
  audience: LoginTab;
  centered: boolean;
  magicLink: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const emailErrorId = useId();
  const queryError =
    params.get("error") === "credentials"
      ? "Email or password is wrong."
      : params.get("error") === "rate"
        ? "Too many attempts. Wait a few minutes and try again."
        : params.get("error") === "totp"
          ? "This account needs the in-app two-step step. Sign in from this page after it finishes loading."
          : params.get("error") === "company"
            ? "Company sign-in is not connected yet."
            : params.get("error") === "magic"
              ? "That sign-in link is no longer valid. Ask for a new one."
              : params.get("error") === "magic-off"
                ? "Email sign-in links are turned off."
                : null;
  const [error, setError] = useState<string | null>(queryError);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<LoginTab>(audience);

  function onTabKey(event: KeyboardEvent) {
    const next = nextLoginTab(tab, event.key);
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(next === "team" ? "tab-team" : "tab-client")?.focus();
  }

  return (
    <main className={`flex flex-col gap-6 px-6 py-8 min-[701px]:px-12 min-[701px]:py-12 ${centered ? "w-full max-w-[440px]" : "min-[701px]:border-r min-[701px]:border-line"}`}>
      <div className="text-xl font-bold">
        spec<span className="text-brand">i</span>ficity · Jarvis
      </div>
      <div>
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Sign in to Jarvis</h1>
        <p className="mt-2 text-sm text-soft">{brand.tagline}</p>
      </div>
      <div role="tablist" aria-label="Who is signing in" className="flex overflow-hidden rounded border border-line" onKeyDown={onTabKey}>
        {TABS.map((item) => (
          <button
            key={item.id}
            id={item.id === "team" ? "tab-team" : "tab-client"}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={item.panel}
            tabIndex={tab === item.id ? 0 : -1}
            className={`min-h-11 flex-1 text-sm font-semibold ${tab === item.id ? "bg-card text-ink shadow-[inset_0_-3px_0_var(--brand)]" : "bg-transparent text-soft"}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="panel-client" role="tabpanel" aria-labelledby="tab-client" hidden={tab !== "client"}>
        {!ticket ? (
          <form
            className="space-y-4"
            method="post"
            action="/api/auth/login"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const email = String(form.get("email") || "");
              const invalid = workEmailError(email);
              if (invalid) {
                setEmailError(invalid);
                setError(null);
                return;
              }
              setEmailError(null);
              setPending(true);
              setError(null);
              setNotice(null);
              const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password: form.get("password") }),
              });
              const data = await res.json();
              setPending(false);
              if (!res.ok) {
                setError(data.error || "Could not sign in");
                return;
              }
              if (data.totpRequired) {
                setTicket(data.ticket);
                return;
              }
              router.push(sameOriginPath(data.next, homeHref));
              router.refresh();
            }}
          >
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-soft">
                Work email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                required
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailErrorId}
                className="min-h-11 w-full rounded border border-line bg-chip px-3 text-[15px] text-ink"
                onBlur={(event) => setEmailError(event.currentTarget.value.trim() ? workEmailError(event.currentTarget.value) : null)}
              />
              <p id={emailErrorId} className="mt-1 text-sm text-danger" hidden={!emailError}>
                {emailError || WORK_EMAIL_ERROR}
              </p>
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-soft">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="min-h-11 w-full rounded border border-line bg-chip px-3 pr-20 text-[15px] text-ink"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 min-h-9 min-w-14 px-2 text-[13px] font-semibold text-soft"
                  aria-pressed={showPassword}
                  aria-controls="login-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <button disabled={pending} className="btn-brand flex min-h-11 w-full items-center justify-center rounded text-sm">
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form
            className="space-y-4"
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
              if (!res.ok) {
                setError(data.error || "Could not verify");
                return;
              }
              router.push(sameOriginPath(data.next, homeHref));
              router.refresh();
            }}
          >
            <p className="text-sm text-soft">Enter the six-digit code from your authenticator app.</p>
            <input name="code" inputMode="numeric" autoComplete="one-time-code" required className="min-h-11 w-full rounded border border-line bg-chip px-3 tracking-[0.3em] text-ink" />
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <button disabled={pending} className="btn-brand flex min-h-11 w-full items-center justify-center rounded text-sm">
              Verify
            </button>
          </form>
        )}
        {magicLink && !ticket && (
          <button
            type="button"
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded border border-line text-sm font-semibold text-ink"
            onClick={async () => {
              const input = document.getElementById("login-email") as HTMLInputElement | null;
              const email = input?.value || "";
              const invalid = workEmailError(email);
              if (invalid) {
                setEmailError(invalid);
                return;
              }
              setEmailError(null);
              setPending(true);
              setError(null);
              const res = await fetch("/api/auth/magic-link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const data = await res.json().catch(() => ({}));
              setPending(false);
              if (!res.ok) {
                setError(data.error || "Could not start email sign-in.");
                return;
              }
              setNotice(data.message || MAGIC_LINK_READY);
            }}
          >
            Email me a sign-in link instead
          </button>
        )}
        {notice && <p className="mt-3 text-sm text-soft">{notice}</p>}
        <p className="mt-3 text-sm text-muted">
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center underline">
            Forgot password?
          </Link>
        </p>
      </div>
      <div id="panel-team" role="tabpanel" aria-labelledby="tab-team" hidden={tab !== "team"}>
        {error && tab === "team" && (
          <p className="mb-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <a href="/api/auth/company" className="btn-brand flex min-h-11 w-full items-center justify-center rounded text-sm">
          Continue with company sign-in
        </a>
      </div>
      <p className="text-sm text-muted">
        Need help signing in?{" "}
        <Link href="/contact" className="inline-flex min-h-11 items-center underline">
          Contact support
        </Link>
      </p>
      {hint && (
        <div className="rounded border border-line bg-chip p-3 text-xs text-muted">
          <div>Demo owner: {hint.ownerEmail}</div>
          {hint.ownerPassword && <div>Password: {hint.ownerPassword}</div>}
          <div className="mt-1">Admin: {hint.adminEmail}</div>
        </div>
      )}
    </main>
  );
}

const CARDS: { key: keyof PublicLoginAnalytics["metrics"]; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "verifiedHumanConversions", label: "Verified-human conversions" },
  { key: "callsAnswered", label: "Calls answered" },
  { key: "activeCampaigns", label: "Active campaigns" },
];

export function AnalyticsPanel({ onFail, initial = null }: { onFail: () => void; initial?: PublicLoginAnalytics | null }) {
  const [payload, setPayload] = useState<PublicLoginAnalytics | null>(initial);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    let stopped = false;
    const pull = async () => {
      try {
        const response = await fetch("/api/public/login-analytics");
        if (!response.ok) throw new Error("feed");
        const body = (await response.json()) as PublicLoginAnalytics;
        if (!body?.metrics) throw new Error("feed");
        if (!stopped) {
          setPayload(body);
          setLoading(false);
        }
      } catch {
        if (!stopped) onFail();
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 60_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [onFail]);

  return (
    <section aria-labelledby="login-analytics-title" className="flex flex-col gap-6">
      <h2 id="login-analytics-title" className="text-xl font-semibold tracking-tight">
        Across every Jarvis client, this month
      </h2>
      <p className="text-sm text-muted">
        Combined totals from all clients. No client names or individual results are shown.
        {payload ? ` Updated ${payload.updatedMinutesAgo} min ago.` : ""}
      </p>
      <div className="grid grid-cols-1 gap-4 min-[701px]:grid-cols-2" aria-live="off">
        {CARDS.map((card) => (
          <MetricCard key={card.key} label={card.label} loading={loading} figure={payload?.metrics[card.key] ?? null} />
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, loading, figure }: { label: string; loading: boolean; figure: PublicFigure | null }) {
  if (loading || !figure) {
    return (
      <article className="rounded-lg border border-line bg-card p-6" aria-busy="true">
        <div className="h-10 w-28 rounded bg-chip" />
        <p className="mt-3 text-sm text-soft">{label}</p>
        <div className="mt-3 h-10 rounded bg-chip" />
      </article>
    );
  }
  if (figure.hidden) {
    return (
      <article className="rounded-lg border border-line bg-card p-6">
        <p className="num text-sm text-muted">— Not enough data to show</p>
        <p className="mt-2 text-sm text-soft">{label}</p>
      </article>
    );
  }
  return (
    <article className="rounded-lg border border-line bg-card p-6">
      <CountUp value={figure.value} />
      <p className="mt-1 text-sm text-soft">{label}</p>
      <Sparkline series={figure.series} />
    </article>
  );
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setShown(countUpValue(now - start, value, false));
      if (now - start < 900) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <p className="num text-[44px] leading-none font-semibold tracking-tight max-[700px]:text-[34px]">{shown.toLocaleString("en-US")}</p>;
}

export function sparklinePoints(series: number[]) {
  if (!series.length) return "";
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const span = Math.max(1, max - min);
  return series
    .map((value, index) => {
      const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 100;
      const y = 18 - ((value - min) / span) * 16;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function Sparkline({ series }: { series: number[] }) {
  return (
    <svg viewBox="0 0 100 20" aria-hidden="true" className="mt-3 h-10 w-full">
      <polyline fill="none" stroke="var(--brand)" strokeWidth="1.5" points={sparklinePoints(series)} />
    </svg>
  );
}

import Link from "next/link";
import { brandTokens } from "@/lib/brand/tokens";
import { BRAND_WORDMARK } from "@/lib/brand";
import { PLAN_CONTACT_HREF, PLAN_RENEW_LABEL } from "@/lib/plans/plan";

export function PlanClosed({ state, launchGaps = false }: { state: "expired" | "revoked"; launchGaps?: boolean }) {
  const tone = brandTokens.light;
  const title = launchGaps ? "This plan link has expired" : state === "expired" ? "This link has expired" : "This link was revoked";
  const body = launchGaps
    ? "Plan links expire for security. Ask your Specificity contact for a new one."
    : "Ask the team for a new link. This page does not keep your name.";
  return (
    <main className="grid min-h-screen place-items-center px-4" style={{ background: tone.canvas, color: tone.ink, fontFamily: brandTokens.font.stack }}>
      <div className="max-w-md text-center">
        <p className="text-sm" style={{ color: tone.muted }}>{BRAND_WORDMARK}</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6">{body}</p>
        {launchGaps ? (
          <Link href="/" className="btn-brand mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm">Go to homepage</Link>
        ) : (
          <a href={PLAN_CONTACT_HREF} className="btn-brand mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm">{PLAN_RENEW_LABEL}</a>
        )}
      </div>
    </main>
  );
}

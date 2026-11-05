import { PublicBrandLogo } from "@/components/public-brand-logo";
import { PUBLIC_LOGO_ALT, PUBLIC_TAGLINE } from "@/lib/brand/public";

/** Visitor share pages. Signed-in chrome does not use this lockup. */
export function BrandLockup({
  compact = false,
  showTagline = false,
}: {
  logoUrl?: string;
  mark?: string;
  compact?: boolean;
  showTagline?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <PublicBrandLogo slot="wordmark-light" height={40} />
      {!compact && showTagline ? <div className="text-xs italic text-muted">{PUBLIC_TAGLINE}</div> : null}
    </div>
  );
}

export function BrandFooter() {
  return (
    <footer className="px-4 py-6 text-center text-sm text-muted">
      {PUBLIC_LOGO_ALT} · {PUBLIC_TAGLINE}
    </footer>
  );
}

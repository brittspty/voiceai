import { brandTokens } from "@/lib/brand/tokens";

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
      <img src={brandTokens.logo.src} alt={brandTokens.logo.alt} className="h-10 w-auto" />
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink">{brandTokens.wordmark}</div>
          {showTagline && <div className="text-xs italic text-muted">{brandTokens.tagline}</div>}
        </div>
      )}
    </div>
  );
}

export function BrandFooter() {
  return (
    <footer className="px-4 py-6 text-center text-sm text-muted">
      {brandTokens.wordmark} Inc · {brandTokens.tagline}
    </footer>
  );
}

import { brandTokens } from "@/lib/brand/tokens";
import { BrandMark } from "@/components/brand-mark";

export function BrandLockup({
  logoUrl = "",
  mark = brandTokens.logo.mark,
  compact = false,
}: {
  logoUrl?: string;
  mark?: string;
  compact?: boolean;
}) {
  const src = logoUrl || brandTokens.logo.src;
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark logoUrl={src} mark={mark || brandTokens.logo.mark} letter={!src} />
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink">{brandTokens.wordmark}</div>
          <div className="text-xs text-muted">{brandTokens.tagline}</div>
        </div>
      )}
    </div>
  );
}

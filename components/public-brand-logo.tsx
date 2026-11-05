import { PUBLIC_LOGO_ALT, publicLogoSize, publicLogos } from "@/lib/brand/public";

const sources = {
  "wordmark-dark": publicLogos.wordmarkDark,
  "wordmark-light": publicLogos.wordmarkLight,
  "lockup-dark": publicLogos.lockupDark,
  "lockup-light": publicLogos.lockupLight,
} as const;

export function PublicBrandLogo({
  slot,
  height,
  className,
  alt = PUBLIC_LOGO_ALT,
}: {
  slot: keyof typeof sources;
  height: number;
  className?: string;
  alt?: string;
}) {
  const kind = slot.startsWith("lockup") ? "lockup" : "wordmark";
  const size = publicLogoSize(kind, height);
  return <img src={sources[slot]} alt={alt} width={size.width} height={size.height} className={className} />;
}

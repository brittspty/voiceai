import { brandLogoAlt, brandLogoRatio, brandLogoSrc, type BrandLogoTone, type BrandLogoVariant } from "@/lib/brand/logo";

/**
 * The one JAI logo component.
 * lockup: sign-in, sign-up, forgot-password, homepage hero.
 * wordmark: shell header and sidebar (28px desktop, 24px phone).
 * mark: collapsed nav and small icons.
 */
export function BrandLogo({
  variant,
  tone = "dark",
  height,
  className,
  alt,
}: {
  variant: BrandLogoVariant;
  tone?: BrandLogoTone;
  height?: number;
  className?: string;
  alt?: string;
}) {
  const h = height ?? (variant === "lockup" ? 120 : variant === "wordmark" ? 28 : 32);
  const w = Math.round(h * brandLogoRatio(variant));
  return (
    // SVGs are served as-is; the Next image optimizer does not process them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brandLogoSrc(variant, tone)}
      alt={alt ?? brandLogoAlt(variant)}
      width={w}
      height={h}
      data-brand-logo={variant}
      className={className}
      style={className ? undefined : { height: h, width: "auto" }}
    />
  );
}

/** For surfaces that follow the next-themes class: light file in light theme, dark file in dark theme. */
export function BrandLogoThemed({ variant, className = "", height, alt }: { variant: BrandLogoVariant; className?: string; height?: number; alt?: string }) {
  return (
    <>
      <BrandLogo variant={variant} tone="light" height={height} alt={alt} className={`dark:hidden ${className}`.trim()} />
      <BrandLogo variant={variant} tone="dark" height={height} alt={alt} className={`hidden dark:block ${className}`.trim()} />
    </>
  );
}

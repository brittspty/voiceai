/**
 * Visitor marketing brand. Signed-in app chrome keeps lib/brand.ts.
 * Jason locked the public tagline and the public web address.
 */
export const PUBLIC_TAGLINE = "Your Audience; Everywhere";
export const PUBLIC_SITE_HOST = "jai.specificityinc.com";
export const PUBLIC_SITE_ORIGIN = "https://jai.specificityinc.com";
export const PUBLIC_LOGO_ALT = "JAI by Specificity";

export const publicLogos = {
  wordmarkDark: "/brand/jai-wordmark-dark.svg",
  wordmarkLight: "/brand/jai-wordmark-light.svg",
  lockupDark: "/brand/jai-lockup-dark.svg",
  lockupLight: "/brand/jai-lockup-light.svg",
  mark: "/brand/jai-mark.svg",
  rasterDark: "/brand/jai-logo-final-dark.png",
  rasterLight: "/brand/jai-logo-final-light.png",
  favicon32: "/brand/jai-favicon-32.png",
  favicon192: "/brand/jai-favicon-192.png",
  og: "/brand/jai-og.png",
} as const;

/** viewBox sizes from the final SVGs. Lockup includes "by Specificity". */
export const publicLogoBox = {
  wordmark: { width: 538.2, height: 462.8 },
  lockup: { width: 538.2, height: 458 },
} as const;

/** Full lockup stays at least 200px wide. Wordmark stays at least 24px tall. */
export function publicLogoSize(kind: keyof typeof publicLogoBox, height: number) {
  const box = publicLogoBox[kind];
  return { width: Math.round((height * box.width) / box.height), height };
}

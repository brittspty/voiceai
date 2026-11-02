import { PRODUCT_HOME_ALT, PRODUCT_LOGO_ALT } from "./names";

type Env = Record<string, string | undefined>;

export type BrandLogoVariant = "lockup" | "wordmark" | "mark";
/** "dark" = for black or #231F20 backgrounds. "light" = for white, including emails, exports and PDF reports. */
export type BrandLogoTone = "dark" | "light";

/** Off unless BRAND_LOGO_V2 is explicitly on. While off, the previous Specificity mark shows. */
export function brandLogoV2Enabled(env: Env = process.env) {
  const value = (env.BRAND_LOGO_V2 || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/** Transparent vector files. Never a PNG with a baked-in background. */
const FILES: Record<BrandLogoVariant, Record<BrandLogoTone, string>> = {
  lockup: { dark: "/brand/jai/jai-lockup-dark.svg", light: "/brand/jai/jai-lockup-light.svg" },
  wordmark: { dark: "/brand/jai/jai-wordmark-dark.svg", light: "/brand/jai/jai-wordmark-light.svg" },
  mark: { dark: "/brand/jai/jai-mark.svg", light: "/brand/jai/jai-mark-light.svg" },
};

/** Width over height, from each SVG's viewBox. */
const RATIO: Record<BrandLogoVariant, number> = {
  lockup: 538.2 / 458.0,
  wordmark: 538.2 / 462.8,
  mark: 1,
};

export function brandLogoSrc(variant: BrandLogoVariant, tone: BrandLogoTone) {
  return FILES[variant][tone];
}

export function brandLogoRatio(variant: BrandLogoVariant) {
  return RATIO[variant];
}

/** The wordmark links home in the shell, so it reads "JAI home". The lockup and mark read "JAI by Specificity". */
export function brandLogoAlt(variant: BrandLogoVariant) {
  return variant === "wordmark" ? PRODUCT_HOME_ALT : PRODUCT_LOGO_ALT;
}

/** Email clients do not render SVG. A transparent PNG rendered from the light lockup, at an absolute URL. */
export const BRAND_EMAIL_LOGO_PATH = "/brand/jai/jai-lockup-light@2x.png";

export function brandEmailLogoUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}${BRAND_EMAIL_LOGO_PATH}`;
}

/** 1200x630 OG image: the dark lockup on black. */
export const BRAND_OG_V2_PATH = "/brand/jai-og-v2.png";

/** Head icons and manifest. All live under /brand/jai so the old /favicon.ico and /site.webmanifest are untouched while the switch is off. */
export function brandHeadIcons(env: Env = process.env) {
  if (!brandLogoV2Enabled(env)) return null;
  return {
    manifest: "/brand/jai/site.webmanifest",
    icons: {
      icon: [
        { url: "/brand/jai/favicon.ico", sizes: "16x16 32x32 48x48" },
        { url: "/brand/jai/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/jai/favicon-16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: [{ url: "/brand/jai/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

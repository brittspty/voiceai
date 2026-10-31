import { brandTokens } from "./brand/tokens";
import { clientConfig, type ClientConfig } from "./client-config";

export { AIS2L_LINE, AIS2L_NAME, PRODUCT_NAME, PRODUCT_TITLE, PRODUCT_WORDMARK } from "./brand/names";

export const PRODUCT_TAGLINE =
  "Avery calls your new leads in minutes, follows calling rules, and logs every call to GoHighLevel.";

/** One brand name for the header, sidebar, and sign-in. Not the workspace subtitle. */
export const BRAND_WORDMARK = "Specificity";
export const BRAND_TAGLINE = "Identify. Engage. Convert.";

/** Official Specificity orange and Poppins live in the token file. IBM Plex Mono is only for small labels. */
export const BRAND_FONT = brandTokens.font.family;
export const BRAND_MONO = brandTokens.font.mono;
export const PLACEHOLDER_BRAND_COLOR = brandTokens.light.brand;
/** Dark surfaces, including the ink sidebar. */
export const LOGO_ON_DARK = "/brand/specificity-logo-reversed.png";
/** Light surfaces: mobile header, login, share, reports. */
export const LOGO_ON_LIGHT = "/brand/specificity-logo-full.png";
export const LOGO_MARK = "/brand/specificity-mark.png";
export const PLACEHOLDER_LOGO_URL = LOGO_ON_DARK;

/** Color stored by older seeds before the Specificity placeholder existed. */
const UNSET_BRAND_COLOR = "#2563eb";

/** Hosted mark. Light backgrounds only. Poppins and the orange are placeholders. */
export const PLATFORM_LOGO_PATH = brandTokens.logo.src;

export function platformBrand() {
  return {
    brandColor: brandTokens.light.brand,
    logoUrl: PLATFORM_LOGO_PATH,
    inkColor: brandTokens.light.ink,
    fontFamily: brandTokens.font.family,
  };
}

export type Brand = {
  companyName: string;
  subtitle: string;
  agentName: string;
  timezone: string;
  brandColor: string;
  logoUrl: string;
  inkColor: string;
  fontFamily: string;
  mark: string;
};

export function resolveBrandColor(value: string | null | undefined) {
  const color = (value || "").trim();
  if (!color || color.toLowerCase() === UNSET_BRAND_COLOR) return PLACEHOLDER_BRAND_COLOR;
  return color;
}

export function resolveLogoUrl(value: string | null | undefined) {
  const url = (value || "").trim();
  return url || PLACEHOLDER_LOGO_URL;
}

export function isBundledLogo(url: string | null | undefined) {
  return (url || "").startsWith("/brand/");
}

/** Old seeds used "V" as an unset mark. */
export function resolveMark(value: string | null | undefined) {
  const mark = (value || "").trim();
  if (!mark || mark.toUpperCase() === "V") return "S";
  return mark.slice(0, 2);
}

export function brandFromConfig(cfg: ClientConfig = clientConfig()): Brand {
  const platform = platformBrand();
  return {
    companyName: cfg.companyName,
    subtitle: cfg.subtitle,
    agentName: cfg.agentName,
    timezone: cfg.timezone,
    brandColor: resolveBrandColor(cfg.brandColor),
    logoUrl: resolveLogoUrl(cfg.logoUrl),
    inkColor: platform.inkColor,
    fontFamily: platform.fontFamily,
    mark: resolveMark(cfg.mark),
  };
}

export async function loadBrand(): Promise<Brand> {
  try {
    const { prisma } = await import("./db");
    const org = await prisma.org.findUnique({ where: { id: "org" } });
    if (!org) return brandFromConfig();
    const cfg = clientConfig();
    const platform = platformBrand();
    return {
      companyName: org.name,
      subtitle: org.subtitle,
      agentName: org.agentName,
      timezone: org.timezone,
      brandColor: resolveBrandColor(org.brandColor || cfg.brandColor),
      logoUrl: resolveLogoUrl(org.logoUrl),
      inkColor: platform.inkColor,
      fontFamily: platform.fontFamily,
      mark: resolveMark(org.mark || cfg.mark),
    };
  } catch {
    return brandFromConfig();
  }
}

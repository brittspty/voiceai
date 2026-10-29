import { clientConfig, type ClientConfig } from "./client-config";

/** Customer-facing product name. Avery is the AI caller, not the product. */
export const PRODUCT_NAME = "VoiceOps";
export const PRODUCT_TITLE = "VoiceOps: AI calling for service businesses";
export const PRODUCT_TAGLINE =
  "Avery calls your new leads in minutes, follows calling rules, and logs every call to GoHighLevel.";

/** One brand name for the header, sidebar, and sign-in. Not the workspace subtitle. */
export const BRAND_WORDMARK = "Specificity";
export const BRAND_TAGLINE = "Identify. Engage. Convert.";

/** Placeholder tokens until a workspace sets its own color and logo. */
export const BRAND_FONT = "Poppins";
export const PLACEHOLDER_BRAND_COLOR = "#FF5800";
export const PLACEHOLDER_LOGO_URL = "/brand/specificity-logo-reversed.png";

/** Color stored by older seeds before the Specificity placeholder existed. */
const UNSET_BRAND_COLOR = "#2563eb";

export type Brand = {
  companyName: string;
  subtitle: string;
  agentName: string;
  timezone: string;
  brandColor: string;
  logoUrl: string;
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

export function brandFromConfig(cfg: ClientConfig = clientConfig()): Brand {
  return {
    companyName: cfg.companyName,
    subtitle: cfg.subtitle,
    agentName: cfg.agentName,
    timezone: cfg.timezone,
    brandColor: resolveBrandColor(cfg.brandColor),
    logoUrl: resolveLogoUrl(cfg.logoUrl),
    mark: cfg.mark,
  };
}

export async function loadBrand(): Promise<Brand> {
  try {
    const { prisma } = await import("./db");
    const org = await prisma.org.findUnique({ where: { id: "org" } });
    if (!org) return brandFromConfig();
    const cfg = clientConfig();
    return {
      companyName: org.name,
      subtitle: org.subtitle,
      agentName: org.agentName,
      timezone: org.timezone,
      brandColor: resolveBrandColor(org.brandColor || cfg.brandColor),
      logoUrl: resolveLogoUrl(org.logoUrl),
      mark: org.mark || cfg.mark,
    };
  } catch {
    return brandFromConfig();
  }
}

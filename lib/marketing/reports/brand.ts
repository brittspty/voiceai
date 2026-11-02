import { BRAND_TAGLINE, BRAND_WORDMARK, PLACEHOLDER_LOGO_URL, PRODUCT_WORDMARK } from "../../brand";

/** Reports use the product wordmark. The company name and tagline come from lib/brand.ts. */
export const REPORT_PRODUCT = PRODUCT_WORDMARK;
export const REPORT_DOWNLOAD_NAME = "diver-ai-report.pdf";

export function reportFooterLine() {
  return `${REPORT_PRODUCT} by ${BRAND_WORDMARK} · ${BRAND_TAGLINE}`;
}

export const REPORT_LOGO_REVERSED = PLACEHOLDER_LOGO_URL;
export const REPORT_LOGO_FULL = "/brand/specificity-logo-full.png";
export const REPORT_LOGO_ALT = `${BRAND_WORDMARK} Inc`;

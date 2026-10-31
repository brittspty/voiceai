/** In-page hook only. No tag manager, pixel, or other external script. */
export const HOMEPAGE_CTA_EVENT = "jarvis:cta";

export function trackHomepageCta(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HOMEPAGE_CTA_EVENT, { detail: { name } }));
}

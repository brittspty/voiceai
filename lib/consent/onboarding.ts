import { consentSnippet } from "./script";

export const CONSENT_POPUP_ITEM_ID = "consent-popup";

export type WebsiteSeen = "installed" | "detected" | "none";

export type ConsentWebsite = {
  id: string;
  name: string;
  url: string;
  seen: WebsiteSeen;
};

export type ConsentSelectionItem = {
  id: string;
  label: "Consent pop-up";
  website: string;
  url: string;
  selected: true;
  locked: true;
  skippable: false;
  status: "installed" | "detected" | "missing";
};

export type ConsentSelection = {
  required: boolean;
  skippable: boolean;
  snippet: string;
  items: ConsentSelectionItem[];
};

export function consentOnboardingSelection(input: {
  enabled: boolean;
  clientKey: string;
  origin: string;
  websites: ConsentWebsite[];
}): ConsentSelection {
  if (!input.enabled) return { required: false, skippable: true, snippet: "", items: [] };
  const websites = input.websites.length
    ? input.websites
    : [{ id: "every-website", name: "Every client website", url: "", seen: "none" as const }];
  return {
    required: true,
    skippable: false,
    snippet: consentSnippet(input.origin, input.clientKey),
    items: websites.map((site) => ({
      id: `${CONSENT_POPUP_ITEM_ID}:${site.id}`,
      label: "Consent pop-up" as const,
      website: site.name,
      url: site.url,
      selected: true as const,
      locked: true as const,
      skippable: false as const,
      status: site.seen === "none" ? "missing" : site.seen,
    })),
  };
}

/** Skip and uncheck are refused while the pop-up switch is on. The item stays selected. */
export function refuseConsentSkip(input: { enabled: boolean; action: "skip" | "uncheck" | "continue" }) {
  if (!input.enabled) return { ok: true as const };
  if (input.action === "skip" || input.action === "uncheck") {
    return {
      ok: false as const,
      reason: "The consent pop-up is required for every client website and cannot be skipped.",
    };
  }
  return { ok: true as const };
}

export function websitesCovered(websites: { url: string }[], signals: { pageUrl: string; kind: string }[]) {
  if (!websites.length) return false;
  return websites.every((site) => {
    const url = site.url.trim();
    if (!url) return false;
    return signals.some((signal) => urlsMatch(signal.pageUrl, url) && (signal.kind === "installed" || signal.kind === "detected"));
  });
}

export function statusForUrl(url: string, signals: { pageUrl: string; kind: string }[]): WebsiteSeen {
  const mine = signals.filter((signal) => urlsMatch(signal.pageUrl, url));
  if (mine.some((signal) => signal.kind === "installed")) return "installed";
  if (mine.some((signal) => signal.kind === "detected")) return "detected";
  return "none";
}

function urlsMatch(left: string, right: string) {
  return normalizeLoose(left) === normalizeLoose(right);
}

function normalizeLoose(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

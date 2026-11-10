import { PRODUCT_WORDMARK } from "../brand/names";
import { PUBLIC_AD_LINE, PUBLIC_TAGLINE } from "../brand/public";

/**
 * Presenter cues for the demo tour. Jason still has the final word on this script.
 * Research figures on the problem step are published statistics, each with a source.
 * Account numbers, when a step has them, are demo seed facts passed in as `facts`.
 * The compare step has no figures. Specificity company figures stay placeholders.
 */

export const TOUR_COPY_STATUS = "DRAFT" as const;

/** Locked jAI tagline for the demo tour and demo chrome. */
export const DEMO_TAGLINE = PUBLIC_TAGLINE;

/** Supporting line on the demo. Not a statistic. */
export const DEMO_SUPPORTING_LINE = PUBLIC_AD_LINE;

export const HUMANS_CONTROL_BUDGETS = "Humans control budgets";
export const BASED_ON_LABEL = "Based on:";
export const ILLUSTRATIVE_BADGE = "ILLUSTRATIVE DEMO DATA";

/** Exit sits in the DEMO banner, not fixed over a headline. */
export const TOUR_EXIT_CLASS = "relative z-30 ml-auto inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-ink";

export type TourMode = "present" | "self";
export type TourEnding = "client" | "investor";
export type TourBadge = "sample" | "research" | "disclaimer";

export type TourFacts = {
  fakeMaids: number;
  matchedMaids: number;
};

export type TourStep = {
  id: string;
  href: string;
  anchor: string;
  title: string;
  body: string;
  showsFigures: boolean;
  badge: TourBadge;
};

export type TourCatalog = {
  open: TourStep[];
  client: TourStep[];
  investor: TourStep[];
};

const CORE: Array<Omit<TourStep, "body"> & { body: string }> = [
  {
    id: "problem",
    href: "/demo/problem",
    anchor: "problem",
    title: "The problem",
    showsFigures: true,
    badge: "research",
    body: `${DEMO_TAGLINE} Unprotected, platform-guessed buying is where non-human traffic shows up. Thales, April 29, 2026: bots were 53% of web traffic in 2025, and bad bots were 40%. Pixalate, Q2 2026, US programmatic: 25% web, 39% mobile app, 25% CTV. ANA, Q2 2026: 45.1% of programmatic spend reached viewable, fraud-free quality impressions. DoubleVerify, 2026: 2.8% fraud on unprotected campaigns and 0.6% on protected ones. Published research, not a Specificity result.`,
  },
  {
    id: "audience",
    href: "/demo/audiences",
    anchor: "audience",
    title: "Live data market, not a stale database",
    showsFigures: true,
    badge: "sample",
    body: "Owned lists go stale. The data market moves. This sample campaign sources a fresh MAID list: {fakeMaids} ids, {matchedMaids} marked matched. Every row has the vendor, the list id, and the time it was sourced. The older file on screen is not used.",
  },
  {
    id: "serving",
    href: "/demo/serving",
    anchor: "serving",
    title: "One traceable audience, everywhere",
    showsFigures: false,
    badge: "sample",
    body: `${PRODUCT_WORDMARK} prepares that same sample list for Meta, Google, TikTok, and StackAdapt. Pixels can retarget people who engage. This demo does not call a live platform. A person turns a live upload on.`,
  },
  {
    id: "segments",
    href: "/demo/segments",
    anchor: "segments",
    title: "Segments compete",
    showsFigures: false,
    badge: "sample",
    body: "The demo marks one segment to scale, one to keep in test, and one to cut. The labels come from the seed, and a person still decides.",
  },
  {
    id: "verified",
    href: "/demo/verified",
    anchor: "verified",
    title: "Verified vs platform-reported",
    showsFigures: true,
    badge: "sample",
    body: "Platforms report every conversion they see. jAI counts one only when it came from a data-market MAID campaign, passed a contact check, and is not a duplicate. The rows on this screen were run through that rule. Sample data.",
  },
  {
    id: "compare",
    href: "/demo/compare",
    anchor: "compare",
    title: "Our audience beside platform targeting",
    showsFigures: false,
    badge: "sample",
    body: "The buyer audience sits beside platform targeting. This comparison is illustrative demo data. No figures are shown on this step.",
  },
  {
    id: "explanations",
    href: "/demo/explanations",
    anchor: "explanations",
    title: "Plain-English explanations",
    showsFigures: false,
    badge: "sample",
    body: `${PRODUCT_WORDMARK} explains each demo optimization in plain English. Every note ends with a Based on line that names the seeded row it used.`,
  },
  {
    id: "decisions",
    href: "/demo/decisions",
    anchor: "decisions",
    title: "Bots optimize, humans make the call",
    showsFigures: false,
    badge: "sample",
    body: "A bot just tried to write a daily cap. The same lock the product uses blocked it. The bot can recommend. A person approves. Humans control budgets. This demo does not spend.",
  },
  {
    id: "vendors",
    href: "/demo/vendors",
    anchor: "vendors",
    title: "Vendor honesty checks",
    showsFigures: false,
    badge: "sample",
    body: "Known fake IDs are mixed into each sample vendor list. A vendor that matches too many of them is flagged. A holdout group sees no ads, and lift is measured against that group. Nothing is sent. These checks recommend only.",
  },
  {
    id: "report",
    href: "/demo/report",
    anchor: "report",
    title: "The client report",
    showsFigures: false,
    badge: "sample",
    body: "Gulf Coast Dental (Demo) has a weekly report in plain English. The client view of this demo leaves cost off the page. Staff see illustrative seed spend only.",
  },
];

const FORK: Omit<TourStep, "body"> & { body: string } = {
  id: "close",
  href: "/demo/close",
  anchor: "close",
  title: "Choose the ending",
  showsFigures: false,
  badge: "sample",
  body: "Client ending: setup, the weekly view, and a pricing placeholder. Investor ending: the market, the proof on the screens you just saw, and the business lines. Specificity figures are placeholders. Pick one.",
};

const CLIENT_ENDING: Omit<TourStep, "body"> & { body: string } = {
  id: "client",
  href: "/demo/client",
  anchor: "client-ending",
  title: "What a client gets",
  showsFigures: false,
  badge: "sample",
  body: "Walk the setup, what shows up each week, and the pricing placeholders. Nothing on this screen is a quote. Specificity figures are marked [Specificity figure].",
};

const INVESTOR_ENDING: Omit<TourStep, "body"> & { body: string } = {
  id: "investor",
  href: "/demo/investor",
  anchor: "investor",
  title: "The investor ending",
  showsFigures: true,
  badge: "disclaimer",
  body: "US internet advertising was $294.6B in 2025, and US programmatic was $162.4B, per IAB/PwC on April 16, 2026. The business lines are labeled [Specificity figure]. This includes forward-looking statements, it is subject to counsel review, and it does not promise a return.",
};

function fill(template: string, facts: TourFacts) {
  return template.replaceAll("{fakeMaids}", String(facts.fakeMaids)).replaceAll("{matchedMaids}", String(facts.matchedMaids));
}

function fillStep(step: Omit<TourStep, "body"> & { body: string }, facts: TourFacts): TourStep {
  return { ...step, body: fill(step.body, facts) };
}

export function tourCatalog(facts: TourFacts): TourCatalog {
  const core = CORE.map((step) => fillStep(step, facts));
  return {
    open: [...core, fillStep(FORK, facts)],
    client: [...core, fillStep(CLIENT_ENDING, facts)],
    investor: [...core, fillStep(INVESTOR_ENDING, facts)],
  };
}

export function renderTourSteps(facts: TourFacts, ending: TourEnding | null = null): TourStep[] {
  const catalog = tourCatalog(facts);
  if (ending === "client") return catalog.client;
  if (ending === "investor") return catalog.investor;
  return catalog.open;
}

export function parseTourMode(value: string | string[] | undefined): TourMode | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "present" || raw === "self") return raw;
  return null;
}

export function parseTourEnding(value: string | string[] | undefined): TourEnding | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "client" || raw === "investor") return raw;
  return null;
}

export function tourActive(enabled: boolean, mode: TourMode | null) {
  return enabled && mode !== null;
}

export function tourStepIndex(raw: string | string[] | undefined, count: number) {
  const text = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > count) return 0;
  return parsed - 1;
}

export function moveTour(index: number, delta: number, count: number) {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}

export function tourLocation(step: TourStep, mode: TourMode, view: "staff" | "client", index: number, ending: TourEnding | null = null) {
  const params = new URLSearchParams({ tour: mode, step: String(index + 1), view });
  if (ending) params.set("ending", ending);
  return `${step.href}?${params.toString()}`;
}

export function tourKey(key: string, mode: TourMode | null): "next" | "back" | "exit" | null {
  if (key === "Escape") return "exit";
  if (mode !== "present") return null;
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "back";
  return null;
}

export function stepShowsFigures(step: TourStep) {
  return step.showsFigures;
}

export function tourBadgeLabel(badge: TourBadge) {
  if (badge === "research") return "Published research. Not a Specificity result.";
  if (badge === "disclaimer") return "Forward-looking. Subject to counsel review. No promised return.";
  return ILLUSTRATIVE_BADGE;
}

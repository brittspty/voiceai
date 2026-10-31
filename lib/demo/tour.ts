/**
 * DRAFT talking points. PLACEHOLDER COPY pending Jason's approval.
 * Edit the words in this file only. Do not add industry statistics.
 * Numbers, when a step has them, are demo seed facts passed in as `facts`.
 * Step 5 has no figures.
 */

export const TOUR_COPY_STATUS = "DRAFT" as const;

export const HUMANS_CONTROL_BUDGETS = "Humans control budgets";
export const BASED_ON_LABEL = "Based on:";
export const ILLUSTRATIVE_BADGE = "ILLUSTRATIVE DEMO DATA";

/** Exit sits in the DEMO banner, not fixed over a headline. */
export const TOUR_EXIT_CLASS = "relative z-30 ml-auto inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-ink";

export type TourMode = "present" | "self";

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
};

const TEMPLATES: Array<Omit<TourStep, "body"> & { body: string }> = [
  {
    id: "problem",
    href: "/demo",
    anchor: "problem",
    title: "The problem",
    showsFigures: false,
    body: "This demo opens on the problem in these sample accounts: platform targeting is weak, and bot traffic wastes the demo spend.",
  },
  {
    id: "audience",
    href: "/demo/audiences",
    anchor: "audience",
    title: "The audience in the data market",
    showsFigures: true,
    body: "Harbor Point Marine (Demo) has a fake MAID upload in the seed: {fakeMaids} ids, {matchedMaids} marked matched, with the demo file named as the lineage.",
  },
  {
    id: "serving",
    href: "/demo/serving",
    anchor: "serving",
    title: "Serving verified humans",
    showsFigures: false,
    body: "The demo serves those people across Meta, Google, TikTok, and StackAdapt. AIS2L voice sits next to the ads. Nothing here calls a live platform.",
  },
  {
    id: "segments",
    href: "/demo/segments",
    anchor: "segments",
    title: "Segment tests",
    showsFigures: false,
    body: "The demo marks one segment to scale, one to keep in test, and one to cut. The labels come from the seed, and a person still decides.",
  },
  {
    id: "compare",
    href: "/demo/compare",
    anchor: "compare",
    title: "Our audience beside platform targeting",
    showsFigures: false,
    body: "Our audience sits beside platform targeting. This comparison is illustrative demo data. No figures are shown on this step.",
  },
  {
    id: "bots",
    href: "/demo/explanations",
    anchor: "bots",
    title: "Plain-English explanations",
    showsFigures: false,
    body: "Jarvis explains each demo optimization in plain English. Every note ends with a Based on line that names the seeded row it used.",
  },
  {
    id: "feed",
    href: "/demo/decisions",
    anchor: "feed",
    title: "The live feed and decisions",
    showsFigures: false,
    body: "The account manager feed lists demo events, and the inbox holds one-tap decisions. Humans control budgets. The buttons do not spend.",
  },
  {
    id: "report",
    href: "/demo/report",
    anchor: "report",
    title: "The client report",
    showsFigures: false,
    body: "Gulf Coast Dental (Demo) has a weekly report. The client view of this demo leaves cost off the page.",
  },
];

function fill(template: string, facts: TourFacts) {
  return template.replaceAll("{fakeMaids}", String(facts.fakeMaids)).replaceAll("{matchedMaids}", String(facts.matchedMaids));
}

export function renderTourSteps(facts: TourFacts): TourStep[] {
  return TEMPLATES.map((step) => ({ ...step, body: fill(step.body, facts) }));
}

export function parseTourMode(value: string | string[] | undefined): TourMode | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "present" || raw === "self") return raw;
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

export function tourLocation(step: TourStep, mode: TourMode, view: "staff" | "client", index: number) {
  const params = new URLSearchParams({ tour: mode, step: String(index + 1), view });
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

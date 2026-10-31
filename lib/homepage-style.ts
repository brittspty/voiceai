import type { Env } from "./public-routing";

/**
 * Direction B is the homepage we ship. Set HOMEPAGE_DIRECTION=A to preview the
 * other layout. The section order does not change. Ignored while PUBLIC_HOMEPAGE is off.
 */
export function homepageDirection(env: Env = process.env): "A" | "B" {
  return (env.HOMEPAGE_DIRECTION || "").trim().toUpperCase() === "A" ? "A" : "B";
}

export type HomepageStyle = {
  id: "A" | "B";
  hero: string;
  feed: string;
  steps: string;
  band: string;
  bandAlt: string;
  bandButton: string;
  bandGhost: string;
  bandAltButton: string;
  bandAltGhost: string;
};

export function homepageStyle(direction: "A" | "B"): HomepageStyle {
  if (direction === "A") {
    return {
      id: "A",
      hero: "flex flex-col gap-8",
      feed: "rounded-lg border border-line bg-card p-4",
      steps: "flex flex-col gap-4",
      band: "rounded-2xl border border-line bg-card px-6 py-8",
      bandAlt: "rounded-2xl border border-ink bg-canvas px-6 py-8",
      bandButton: "inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-on-brand",
      bandGhost: "inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold",
      bandAltButton: "inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-on-brand",
      bandAltGhost: "inline-flex min-h-11 items-center rounded-full border border-ink px-4 text-sm font-semibold",
    };
  }
  return {
    id: "B",
    hero: "lg:grid-cols-2",
    feed: "rounded-2xl bg-ink p-5 text-on-ink",
    steps: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
    band: "bg-brand px-6 py-10 text-on-brand",
    bandAlt: "bg-ink px-6 py-10 text-on-ink",
    bandButton: "inline-flex min-h-11 items-center rounded-full bg-on-brand px-4 text-sm font-semibold text-ink",
    bandGhost: "inline-flex min-h-11 items-center rounded-full border border-on-brand px-4 text-sm font-semibold",
    bandAltButton: "inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-on-brand",
    bandAltGhost: "inline-flex min-h-11 items-center rounded-full border border-on-ink px-4 text-sm font-semibold",
  };
}

/** Premium, precise. No bounce. Layout, tables, flags, and PDF do not animate. */
export const REPORT_MOTION = {
  countUpMs: 900,
  drawInMs: 600,
  tooltipInMs: 120,
  tooltipOutMs: 80,
  seriesMorphMs: 300,
  liveTickMs: 200,
  liveHighlightMs: 1000,
  dialogOpenMs: 200,
  dialogCloseMs: 140,
  pressMs: 100,
  pollMs: 60_000,
  cacheMs: 5 * 60_000,
  staleMs: 6 * 60 * 60_000,
  drawEasing: "cubic-bezier(.2,.8,.2,1)",
} as const;

export function easeOutCubic(t: number) {
  const k = Math.min(1, Math.max(0, t));
  return 1 - (1 - k) ** 3;
}

/** Reduced motion shows the final number and a static line. */
export function shouldAnimate(reduceMotion: boolean) {
  return !reduceMotion;
}

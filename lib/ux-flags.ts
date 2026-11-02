import { flagOn, type Env } from "./demo/flags";

/** Off unless HOME_LOGOS is explicitly on. The public logo strip stays hidden. */
export function homeLogosEnabled(env: Env = process.env) {
  return flagOn(env, "HOME_LOGOS");
}

/** Off unless HOME_QUOTES is explicitly on. Public testimonials stay hidden. */
export function homeQuotesEnabled(env: Env = process.env) {
  return flagOn(env, "HOME_QUOTES");
}

/** Off unless HOME_PRICING is explicitly on. The public pricing answer stays the neutral block. */
export function homePricingEnabled(env: Env = process.env) {
  return flagOn(env, "HOME_PRICING");
}

/**
 * Off unless UX_LAUNCH_GAPS is explicitly on.
 * Covers no-access, empty, loading, AI-working, 404, and the client compare table.
 * Error boundaries and missing-money labels are not behind this switch.
 */
export function uxLaunchGapsEnabled(env: Env = process.env) {
  return flagOn(env, "UX_LAUNCH_GAPS");
}

/** Workspace flag is on, but the demo secret is unset. Only used while UX_LAUNCH_GAPS is on. */
export function demoTakingABreak(env: Env = process.env) {
  return uxLaunchGapsEnabled(env) && flagOn(env, "DEMO_WORKSPACE") && !(env.DEMO_ACCESS_SECRET || "").trim();
}

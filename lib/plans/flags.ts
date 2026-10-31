import { flagOn, type Env } from "../demo/flags";

/** Off unless CLIENT_PLANS is explicitly on. */
export function clientPlansEnabled(env: Env = process.env) {
  return flagOn(env, "CLIENT_PLANS");
}

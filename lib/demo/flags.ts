export type Env = Record<string, string | undefined>;

export function flagOn(env: Env, name: string) {
  const value = (env[name] || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/** Off unless DEMO_WORKSPACE is on and DEMO_ACCESS_SECRET is set. */
export function demoWorkspaceEnabled(env: Env = process.env) {
  return flagOn(env, "DEMO_WORKSPACE") && Boolean((env.DEMO_ACCESS_SECRET || "").trim());
}

/** Off unless the demo workspace is on and DEMO_TOUR is on. */
export function demoTourEnabled(env: Env = process.env) {
  return demoWorkspaceEnabled(env) && flagOn(env, "DEMO_TOUR");
}

export function demoAccessSecret(env: Env = process.env) {
  return (env.DEMO_ACCESS_SECRET || "").trim();
}

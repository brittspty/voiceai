import { parseExtraConnectionNames, type Env } from "../config";

export type NamedKeyConnection = {
  /** `primary` or a name from TRAXY_EXTRA_CONNECTIONS / APOLLO_EXTRA_CONNECTIONS. */
  name: string;
  apiKey: string;
  /** Environment variable name. Never the key itself. */
  apiKeyEnv: string;
};

export type NamedKeySkip = { name: string; reason: string };

export function extraKeyEnv(prefix: "TRAXY" | "APOLLO", name: string) {
  return `${prefix}_${name.trim().toUpperCase()}_API_KEY`;
}

/** Empty and `primary` both use the primary key. */
export function connectionNameOf(raw: string | null | undefined) {
  const name = (raw || "").trim().toLowerCase();
  if (!name || name === "primary") return "primary";
  return name;
}

export function connectionSlugOk(name: string) {
  return name === "primary" || /^[a-z][a-z0-9_]{0,32}$/.test(name);
}

/**
 * Primary key plus names listed in the extra-connections variable.
 * A missing extra key skips that name. The primary key is not copied onto an extra name.
 */
export function planNamedKeyConnections(
  env: Env,
  spec: {
    listEnv: "TRAXY_EXTRA_CONNECTIONS" | "APOLLO_EXTRA_CONNECTIONS";
    primaryEnv: "TRAXY_API_KEY" | "APOLLO_API_KEY";
    prefix: "TRAXY" | "APOLLO";
  },
): { connections: NamedKeyConnection[]; skipped: NamedKeySkip[] } {
  const connections: NamedKeyConnection[] = [];
  const skipped: NamedKeySkip[] = [];
  const primary = (env[spec.primaryEnv] || "").trim();
  if (!primary) skipped.push({ name: "primary", reason: `missing ${spec.primaryEnv}` });
  else connections.push({ name: "primary", apiKey: primary, apiKeyEnv: spec.primaryEnv });

  const listed = parseExtraConnectionNames(env[spec.listEnv]);
  for (const name of listed.invalid) {
    skipped.push({ name: name.toLowerCase(), reason: `invalid connection name ${name}` });
  }
  for (const name of listed.names) {
    const apiKeyEnv = extraKeyEnv(spec.prefix, name);
    const apiKey = (env[apiKeyEnv] || "").trim();
    if (!apiKey) {
      skipped.push({ name, reason: `missing ${apiKeyEnv}` });
      continue;
    }
    connections.push({ name, apiKey, apiKeyEnv });
  }
  return { connections, skipped };
}

/** Mock mode can assign a fixture without a key. Names still have to be listed. */
export function mockReadyNames(env: Env, listEnv: "TRAXY_EXTRA_CONNECTIONS" | "APOLLO_EXTRA_CONNECTIONS") {
  const listed = parseExtraConnectionNames(env[listEnv]);
  return ["primary", ...listed.names];
}

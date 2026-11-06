import { googleAnalyticsSyncEnabled, parseExtraConnectionNames, type Env } from "../config";
import { connectionNameOf, connectionSlugOk } from "../prospects/connections";

export const ANALYTICS_READONLY_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const ANALYTICS_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export type AnalyticsConnection = {
  /** `primary` or a name from GOOGLE_ANALYTICS_EXTRA_CONNECTIONS. */
  name: string;
  refreshToken: string;
  /** Environment variable name. Never the token itself. */
  refreshTokenEnv: string;
};

export type AnalyticsSkip = { name: string; reason: string };

export function analyticsExtraTokenEnv(name: string) {
  return `GOOGLE_ANALYTICS_${name.trim().toUpperCase()}_REFRESH_TOKEN`;
}

/** Empty and `primary` are stored as an empty connection name. */
export function storedAnalyticsConnection(raw: string | null | undefined) {
  const name = connectionNameOf(raw);
  return name === "primary" ? "" : name;
}

export function analyticsConnectionKey(raw: string | null | undefined) {
  return connectionNameOf(raw);
}

/**
 * Primary token plus names listed in GOOGLE_ANALYTICS_EXTRA_CONNECTIONS.
 * A missing extra token skips that name. The primary token is not copied onto an extra name.
 * GOOGLE_ADS_REFRESH_TOKEN is not read.
 */
export function planAnalyticsConnections(env: Env): { connections: AnalyticsConnection[]; skipped: AnalyticsSkip[] } {
  const connections: AnalyticsConnection[] = [];
  const skipped: AnalyticsSkip[] = [];
  const primary = (env.GOOGLE_ANALYTICS_REFRESH_TOKEN || "").trim();
  if (!primary) skipped.push({ name: "primary", reason: "missing GOOGLE_ANALYTICS_REFRESH_TOKEN" });
  else connections.push({ name: "primary", refreshToken: primary, refreshTokenEnv: "GOOGLE_ANALYTICS_REFRESH_TOKEN" });

  const listed = parseExtraConnectionNames(env.GOOGLE_ANALYTICS_EXTRA_CONNECTIONS);
  for (const name of listed.invalid) {
    skipped.push({ name: name.toLowerCase(), reason: `invalid connection name ${name}` });
  }
  for (const name of listed.names) {
    const refreshTokenEnv = analyticsExtraTokenEnv(name);
    const refreshToken = (env[refreshTokenEnv] || "").trim();
    if (!refreshToken) {
      skipped.push({ name, reason: `missing ${refreshTokenEnv}` });
      continue;
    }
    connections.push({ name, refreshToken, refreshTokenEnv });
  }
  return { connections, skipped };
}

export function analyticsTokenConfigured(env: Env) {
  return planAnalyticsConnections(env).connections.length > 0;
}

/** New Analytics decisions stay off unless the sync flag is on and a refresh token env is set. */
export function googleAnalyticsDecisionsEnabled(env: Env = process.env) {
  return googleAnalyticsSyncEnabled(env) && analyticsTokenConfigured(env);
}

export type AnalyticsClientRow = {
  id: string;
  name: string;
  googleAnalyticsConnectionName: string;
  googleAnalyticsPropertyId: string;
};

export type PlannedAnalyticsRead = {
  client: AnalyticsClientRow;
  connection: string;
  propertyId: string;
};

export type PlannedAnalyticsSkip = { name: string; client: string; reason: string };

/** Unmapped clients are omitted. A mapped client whose connection is missing is skipped. */
export function clientsToRead(
  clients: readonly AnalyticsClientRow[],
  plan: { connections: readonly { name: string }[]; skipped: readonly AnalyticsSkip[] },
): { ready: PlannedAnalyticsRead[]; skipped: PlannedAnalyticsSkip[] } {
  const readyNames = new Set(plan.connections.map((row) => row.name));
  const skippedByName = new Map(plan.skipped.map((row) => [row.name, row.reason]));
  const ready: PlannedAnalyticsRead[] = [];
  const skipped: PlannedAnalyticsSkip[] = [];
  for (const client of clients) {
    const propertyId = client.googleAnalyticsPropertyId.trim();
    if (!propertyId) continue;
    if (!/^\d{6,12}$/.test(propertyId)) {
      skipped.push({ name: analyticsConnectionKey(client.googleAnalyticsConnectionName), client: client.name, reason: "property id is not a GA4 numeric id" });
      continue;
    }
    const connection = analyticsConnectionKey(client.googleAnalyticsConnectionName);
    if (connection !== "primary" && !connectionSlugOk(connection)) {
      skipped.push({ name: connection, client: client.name, reason: `invalid connection name ${connection}` });
      continue;
    }
    if (!readyNames.has(connection)) {
      const reason = skippedByName.get(connection) || `connection ${connection} is not listed in GOOGLE_ANALYTICS_EXTRA_CONNECTIONS`;
      skipped.push({ name: connection, client: client.name, reason });
      continue;
    }
    ready.push({ client, connection, propertyId });
  }
  return { ready, skipped };
}

import { claritySyncEnabled, parseExtraConnectionNames, type Env } from "../config";
import { connectionSlugOk } from "../prospects/connections";

export type ClarityConnection = {
  /** A name from CLARITY_CONNECTIONS. */
  name: string;
  token: string;
  /** Environment variable name. Never the token itself. */
  tokenEnv: string;
};

export type ClaritySkip = { name: string; reason: string };

export function clarityTokenEnv(name: string) {
  return `CLARITY_${name.trim().toUpperCase()}_API_TOKEN`;
}

export function clarityConnectionOk(name: string) {
  return connectionSlugOk(name) && name !== "primary";
}

/**
 * Names listed in CLARITY_CONNECTIONS, each with CLARITY_<NAME>_API_TOKEN.
 * A missing token skips that name. Tokens are not copied from one name to another.
 */
export function planClarityConnections(env: Env): { connections: ClarityConnection[]; skipped: ClaritySkip[] } {
  const connections: ClarityConnection[] = [];
  const skipped: ClaritySkip[] = [];
  const listed = parseExtraConnectionNames(env.CLARITY_CONNECTIONS);
  for (const name of listed.invalid) {
    skipped.push({ name: name.toLowerCase(), reason: `invalid connection name ${name}` });
  }
  for (const name of listed.names) {
    const tokenEnv = clarityTokenEnv(name);
    const token = (env[tokenEnv] || "").trim();
    if (!token) {
      skipped.push({ name, reason: `missing ${tokenEnv}` });
      continue;
    }
    connections.push({ name, token, tokenEnv });
  }
  return { connections, skipped };
}

export function clarityTokenConfigured(env: Env) {
  return planClarityConnections(env).connections.length > 0;
}

/** Clarity decisions stay off unless the sync flag is on and a project token env is set. */
export function clarityDecisionsEnabled(env: Env = process.env) {
  return claritySyncEnabled(env) && clarityTokenConfigured(env);
}

export type ClarityScopeRow = {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  label: string;
  connectionName: string;
};

export type PlannedClarityRead = {
  scope: ClarityScopeRow;
  connection: string;
  projectId: string;
};

export type PlannedClaritySkip = { name: string; client: string; reason: string };

/** A scope whose connection is missing, or whose project id is not a Clarity id, is skipped. */
export function scopesToRead(
  scopes: readonly ClarityScopeRow[],
  plan: { connections: readonly { name: string }[]; skipped: readonly ClaritySkip[] },
): { ready: PlannedClarityRead[]; skipped: PlannedClaritySkip[] } {
  const readyNames = new Set(plan.connections.map((row) => row.name));
  const skippedByName = new Map(plan.skipped.map((row) => [row.name, row.reason]));
  const ready: PlannedClarityRead[] = [];
  const skipped: PlannedClaritySkip[] = [];
  for (const scope of scopes) {
    const projectId = scope.projectId.trim();
    const connection = scope.connectionName.trim().toLowerCase();
    if (!projectId) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/.test(projectId)) {
      skipped.push({ name: connection, client: scope.clientName, reason: "project id is not a Clarity project id" });
      continue;
    }
    if (!clarityConnectionOk(connection)) {
      skipped.push({ name: connection, client: scope.clientName, reason: `invalid connection name ${connection || "blank"}` });
      continue;
    }
    if (!readyNames.has(connection)) {
      const reason = skippedByName.get(connection) || `connection ${connection} is not listed in CLARITY_CONNECTIONS`;
      skipped.push({ name: connection, client: scope.clientName, reason });
      continue;
    }
    ready.push({ scope, connection, projectId });
  }
  return { ready, skipped };
}

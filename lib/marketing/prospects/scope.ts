import { connectionNameOf, connectionSlugOk } from "./connections";

export type ScopeSkip = { clientId: string; reason: string };

export type TraxyFilters = {
  monitoredProfileIds: string[];
  leadTiers: string[];
  minIcpMatchPercent: number | null;
};

export type ApolloFilters = { listIds: string[] };

export type TraxyScopeClient = {
  id: string;
  traxyLiveRead: boolean;
  traxyConnectionName: string;
  traxyMonitoredProfileIds: string[];
  traxyLeadTiers: string[];
  traxyMinIcpMatchPercent: number | null;
};

export type ApolloScopeClient = {
  id: string;
  apolloLiveRead: boolean;
  apolloConnectionName: string;
  apolloListIds: string[];
  apolloSavedSearchIds: string[];
};

export type SourcePull<F> = {
  clientId: string;
  connectionName: string;
  filters: F;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRAXY_TIERS = new Set(["UNQUALIFIED", "NURTURE", "QUALIFIED", "PRIORITY"]);
const APOLLO_ID = /^[a-f0-9]{24}$/i;

export function normalizeTraxyFilters(raw: {
  profileIds: readonly string[];
  tiers: readonly string[];
  minIcp: number | null;
}): { ok: true; filters: TraxyFilters } | { ok: false; reason: string } {
  const profiles = raw.profileIds.map((id) => id.trim()).filter(Boolean);
  const tiers = raw.tiers.map((tier) => tier.trim().toUpperCase()).filter(Boolean);
  if (profiles.some((id) => !UUID.test(id))) return { ok: false, reason: "Traxy monitored profile ids must be uuids" };
  if (tiers.some((tier) => !TRAXY_TIERS.has(tier))) {
    return { ok: false, reason: "Traxy tiers must be UNQUALIFIED, NURTURE, QUALIFIED, or PRIORITY" };
  }
  if (raw.minIcp != null && (!Number.isInteger(raw.minIcp) || raw.minIcp < 0 || raw.minIcp > 100)) {
    return { ok: false, reason: "Traxy min ICP match must be a whole number from 0 to 100" };
  }
  return { ok: true, filters: { monitoredProfileIds: profiles, leadTiers: tiers, minIcpMatchPercent: raw.minIcp } };
}

export function normalizeApolloIds(raw: readonly string[], label: string): { ok: true; ids: string[] } | { ok: false; reason: string } {
  const ids = raw.map((id) => id.trim()).filter(Boolean);
  if (ids.some((id) => !APOLLO_ID.test(id))) return { ok: false, reason: `${label} must be 24-character Apollo ids` };
  return { ok: true, ids: [...new Set(ids)] };
}

function traxyUnscoped(filters: TraxyFilters) {
  return filters.monitoredProfileIds.length === 0 && filters.leadTiers.length === 0 && filters.minIcpMatchPercent == null;
}

function traxySignature(filters: TraxyFilters) {
  return JSON.stringify({
    profiles: [...filters.monitoredProfileIds].sort(),
    tiers: [...filters.leadTiers].sort(),
    min: filters.minIcpMatchPercent,
  });
}

function groupPulls<F>(
  prepared: SourcePull<F>[],
  skipped: ScopeSkip[],
  unscoped: (filters: F) => boolean,
  signature: (filters: F) => string,
  sharedReason: string,
  duplicateReason: string,
) {
  const byConnection = new Map<string, SourcePull<F>[]>();
  for (const row of prepared) {
    const list = byConnection.get(row.connectionName) ?? [];
    list.push(row);
    byConnection.set(row.connectionName, list);
  }
  const pulls: SourcePull<F>[] = [];
  for (const rows of byConnection.values()) {
    const open = rows.filter((row) => unscoped(row.filters));
    const scoped = rows.filter((row) => !unscoped(row.filters));
    if (open.length > 0 && rows.length > 1) {
      for (const row of open) skipped.push({ clientId: row.clientId, reason: sharedReason });
    } else if (open.length === 1 && open[0]) {
      pulls.push(open[0]);
    }
    const groups = new Map<string, SourcePull<F>[]>();
    for (const row of scoped) {
      const key = signature(row.filters);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        for (const row of group) skipped.push({ clientId: row.clientId, reason: duplicateReason });
        continue;
      }
      if (group[0]) pulls.push(group[0]);
    }
  }
  return { pulls, skipped };
}

/**
 * One pull per live-read client whose connection is ready.
 * An unfiltered client is pulled only when it is the only live-read client on that connection.
 * Two clients with the same filter are both skipped.
 */
export function planTraxyPulls(clients: readonly TraxyScopeClient[], readyNames: readonly string[]) {
  const ready = new Set(readyNames);
  const skipped: ScopeSkip[] = [];
  const prepared: SourcePull<TraxyFilters>[] = [];
  for (const client of clients) {
    if (!client.traxyLiveRead) {
      skipped.push({ clientId: client.id, reason: "Traxy live read is off" });
      continue;
    }
    const connectionName = connectionNameOf(client.traxyConnectionName);
    if (!connectionSlugOk(connectionName)) {
      skipped.push({ clientId: client.id, reason: "invalid Traxy connection name" });
      continue;
    }
    if (!ready.has(connectionName)) {
      skipped.push({ clientId: client.id, reason: "Traxy connection is not ready" });
      continue;
    }
    const normalized = normalizeTraxyFilters({
      profileIds: client.traxyMonitoredProfileIds,
      tiers: client.traxyLeadTiers,
      minIcp: client.traxyMinIcpMatchPercent,
    });
    if (!normalized.ok) {
      skipped.push({ clientId: client.id, reason: normalized.reason });
      continue;
    }
    prepared.push({ clientId: client.id, connectionName, filters: normalized.filters });
  }
  return groupPulls(
    prepared,
    skipped,
    traxyUnscoped,
    traxySignature,
    "This Traxy connection is shared, so an unfiltered client is not pulled.",
    "The same Traxy filter is on more than one client.",
  );
}

/**
 * List ids scope the credit-free contacts search.
 * Saved-search ids are kept and not queried. They still claim the connection so an unfiltered client cannot take the whole account.
 */
export function planApolloPulls(clients: readonly ApolloScopeClient[], readyNames: readonly string[]) {
  const ready = new Set(readyNames);
  const skipped: ScopeSkip[] = [];
  const prepared: SourcePull<ApolloFilters>[] = [];
  const claims = new Map<string, number>();
  for (const client of clients) {
    if (!client.apolloLiveRead) {
      skipped.push({ clientId: client.id, reason: "Apollo live read is off" });
      continue;
    }
    const connectionName = connectionNameOf(client.apolloConnectionName);
    if (!connectionSlugOk(connectionName)) {
      skipped.push({ clientId: client.id, reason: "invalid Apollo connection name" });
      continue;
    }
    if (!ready.has(connectionName)) {
      skipped.push({ clientId: client.id, reason: "Apollo connection is not ready" });
      continue;
    }
    const lists = normalizeApolloIds(client.apolloListIds, "Apollo list ids");
    const saved = normalizeApolloIds(client.apolloSavedSearchIds, "Apollo saved search ids");
    if (!lists.ok) {
      skipped.push({ clientId: client.id, reason: lists.reason });
      continue;
    }
    if (!saved.ok) {
      skipped.push({ clientId: client.id, reason: saved.reason });
      continue;
    }
    claims.set(connectionName, (claims.get(connectionName) ?? 0) + 1);
    if (!lists.ids.length && saved.ids.length) {
      skipped.push({ clientId: client.id, reason: "Apollo saved searches are stored and are not queried" });
      continue;
    }
    prepared.push({ clientId: client.id, connectionName, filters: { listIds: lists.ids } });
  }
  const planned = groupPulls(
    prepared,
    skipped,
    (filters) => filters.listIds.length === 0,
    (filters) => JSON.stringify([...filters.listIds].sort()),
    "This Apollo connection is shared, so an unfiltered client is not pulled.",
    "The same Apollo list is on more than one client.",
  );
  const pulls = planned.pulls.filter((pull) => {
    if (pull.filters.listIds.length > 0) return true;
    if ((claims.get(pull.connectionName) ?? 0) > 1) {
      planned.skipped.push({ clientId: pull.clientId, reason: "Another client holds an Apollo saved search on this connection." });
      return false;
    }
    return true;
  });
  return { pulls, skipped: planned.skipped };
}

export function traxyScopeData(input: { connection: string; profiles: string[]; tiers: string[]; minIcp: number | null; live: boolean }) {
  const name = connectionNameOf(input.connection);
  if (!connectionSlugOk(name)) return { ok: false as const, reason: "invalid Traxy connection name" };
  const filters = normalizeTraxyFilters({ profileIds: input.profiles, tiers: input.tiers, minIcp: input.minIcp });
  if (!filters.ok) return filters;
  return {
    ok: true as const,
    data: {
      traxyLiveRead: input.live,
      traxyConnectionName: name === "primary" ? "" : name,
      traxyMonitoredProfileIds: filters.filters.monitoredProfileIds,
      traxyLeadTiers: filters.filters.leadTiers,
      traxyMinIcpMatchPercent: filters.filters.minIcpMatchPercent,
    },
  };
}

export function apolloScopeData(input: { connection: string; lists: string[]; savedSearches: string[]; live: boolean }) {
  const name = connectionNameOf(input.connection);
  if (!connectionSlugOk(name)) return { ok: false as const, reason: "invalid Apollo connection name" };
  const lists = normalizeApolloIds(input.lists, "Apollo list ids");
  if (!lists.ok) return lists;
  const saved = normalizeApolloIds(input.savedSearches, "Apollo saved search ids");
  if (!saved.ok) return saved;
  return {
    ok: true as const,
    data: {
      apolloLiveRead: input.live,
      apolloConnectionName: name === "primary" ? "" : name,
      apolloListIds: lists.ids,
      apolloSavedSearchIds: saved.ids,
    },
  };
}

/** A person returned for two clients is dropped. The row is not assigned to either. */
export function assignPulledProspects<T extends { externalId: string }>(batches: { clientId: string; people: T[] }[]) {
  const owners = new Map<string, { clientId: string; person: T }>();
  const conflicts = new Set<string>();
  for (const batch of batches) {
    if (!batch.clientId) continue;
    for (const person of batch.people) {
      const id = person.externalId.trim();
      if (!id) continue;
      if (conflicts.has(id)) continue;
      const existing = owners.get(id);
      if (existing && existing.clientId !== batch.clientId) {
        owners.delete(id);
        conflicts.add(id);
        continue;
      }
      if (!existing) owners.set(id, { clientId: batch.clientId, person });
    }
  }
  return { kept: [...owners.values()], conflicts: [...conflicts] };
}

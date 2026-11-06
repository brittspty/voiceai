/**
 * Polls Traxy and Apollo for clients whose live read is on.
 * INTEGRATIONS_MODE is not consulted. Nothing is uploaded to an ad platform.
 */

import type { Prisma } from "@prisma/client";
import { decideProspectSync, type Env } from "../config";
import { WORKSPACE_ID } from "../types";
import { listApolloContacts, type MappedPerson as ApolloPerson } from "./apollo";
import { mockReadyNames, planNamedKeyConnections } from "./connections";
import { redactProspectSecrets, type FetchLike } from "./guard";
import { assertProspectSyncWorkspace } from "./query";
import { assignPulledProspects, planApolloPulls, planTraxyPulls, type ApolloScopeClient, type TraxyScopeClient } from "./scope";
import { listTraxyLeads, type MappedPerson as TraxyPerson } from "./traxy";

export type ProspectSource = "traxy" | "apollo";

export type ProspectDraft = {
  workspaceId: string;
  clientId: string;
  source: ProspectSource;
  externalId: string;
  displayName: string;
  headline: string;
  company: string;
  location: string;
  emails: string[];
  phones: string[];
  profileUrl: string;
  icpMatchPercent: number | null;
  intentScore: number | null;
  tier: string;
  signal: string;
  seenAt: Date;
  raw: Record<string, unknown>;
};

type ExistingProspect = { id: string; clientId: string; firstSeenAt: Date; lastSeenAt: Date };

export type ProspectStore = {
  find(key: { workspaceId: string; source: ProspectSource; externalId: string }): Promise<ExistingProspect | null>;
  create(row: ProspectDraft & { firstSeenAt: Date; lastSeenAt: Date }): Promise<void>;
  update(id: string, row: Omit<ProspectDraft, "seenAt" | "workspaceId" | "clientId" | "source" | "externalId"> & { firstSeenAt: Date; lastSeenAt: Date }): Promise<void>;
};

type Person = TraxyPerson | ApolloPerson;

function seenDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function toProspectDraft(workspaceId: string, clientId: string, source: ProspectSource, person: Person, now: Date): ProspectDraft {
  return {
    workspaceId,
    clientId,
    source,
    externalId: person.externalId,
    displayName: person.displayName,
    headline: person.headline,
    company: person.company,
    location: person.location,
    emails: person.emails,
    phones: person.phones,
    profileUrl: person.profileUrl,
    icpMatchPercent: person.icpMatchPercent,
    intentScore: person.intentScore,
    tier: person.tier,
    signal: person.signal,
    seenAt: seenDate(person.seenAt, now),
    raw: person.raw,
  };
}

export function mockProspectDraft(source: ProspectSource, clientId: string, now: Date): ProspectDraft {
  const externalId = `mock${source}${clientId}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
  return {
    workspaceId: WORKSPACE_ID,
    clientId,
    source,
    externalId: externalId.length >= 8 ? externalId : `mock${source}example`,
    displayName: "Casey North",
    headline: "Operations lead",
    company: "Harbor Point Marine",
    location: "Austin, TX",
    emails: ["casey.north@example.test"],
    phones: ["+15555550100"],
    profileUrl: "https://example.test/in/casey-north",
    icpMatchPercent: source === "traxy" ? 80 : null,
    intentScore: source === "traxy" ? 0.6 : null,
    tier: source === "traxy" ? "QUALIFIED" : "",
    signal: source === "traxy" ? "Example signal from the mock fixture." : "",
    seenAt: now,
    raw: { fixture: true, source },
  };
}

export async function persistProspectDrafts(store: ProspectStore, drafts: ProspectDraft[]) {
  let written = 0;
  let conflicts = 0;
  for (const draft of drafts) {
    assertProspectSyncWorkspace(draft.workspaceId);
    if (!draft.clientId || !draft.externalId) {
      conflicts += 1;
      continue;
    }
    const existing = await store.find({ workspaceId: draft.workspaceId, source: draft.source, externalId: draft.externalId });
    const fields = {
      displayName: draft.displayName,
      headline: draft.headline,
      company: draft.company,
      location: draft.location,
      emails: draft.emails,
      phones: draft.phones,
      profileUrl: draft.profileUrl,
      icpMatchPercent: draft.icpMatchPercent,
      intentScore: draft.intentScore,
      tier: draft.tier,
      signal: draft.signal,
      raw: draft.raw,
    };
    if (existing && existing.clientId !== draft.clientId) {
      conflicts += 1;
      continue;
    }
    const firstSeenAt = existing && existing.firstSeenAt < draft.seenAt ? existing.firstSeenAt : draft.seenAt;
    const lastSeenAt = existing && existing.lastSeenAt > draft.seenAt ? existing.lastSeenAt : draft.seenAt;
    if (existing) await store.update(existing.id, { ...fields, firstSeenAt, lastSeenAt });
    else {
      await store.create({
        ...draft,
        ...fields,
        firstSeenAt,
        lastSeenAt,
      });
    }
    written += 1;
  }
  return { written, conflicts };
}

async function prismaStore(): Promise<ProspectStore> {
  const { prisma } = await import("../../db");
  return {
    find(key) {
      return prisma.marketingProspect.findUnique({
        where: { workspaceId_source_externalId: key },
        select: { id: true, clientId: true, firstSeenAt: true, lastSeenAt: true },
      });
    },
    async create(row) {
      await prisma.marketingProspect.create({
        data: {
          workspaceId: row.workspaceId,
          clientId: row.clientId,
          source: row.source,
          externalId: row.externalId,
          displayName: row.displayName,
          headline: row.headline,
          company: row.company,
          location: row.location,
          emails: row.emails,
          phones: row.phones,
          profileUrl: row.profileUrl,
          icpMatchPercent: row.icpMatchPercent,
          intentScore: row.intentScore,
          tier: row.tier,
          signal: row.signal,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          raw: row.raw as Prisma.InputJsonValue,
        },
      });
    },
    async update(id, row) {
      await prisma.marketingProspect.update({
        where: { id },
        data: {
          displayName: row.displayName,
          headline: row.headline,
          company: row.company,
          location: row.location,
          emails: row.emails,
          phones: row.phones,
          profileUrl: row.profileUrl,
          icpMatchPercent: row.icpMatchPercent,
          intentScore: row.intentScore,
          tier: row.tier,
          signal: row.signal,
          firstSeenAt: row.firstSeenAt,
          lastSeenAt: row.lastSeenAt,
          raw: row.raw as Prisma.InputJsonValue,
        },
      });
    },
  };
}

async function loadTraxyClients(passed?: readonly TraxyScopeClient[]) {
  if (passed) return [...passed];
  assertProspectSyncWorkspace(WORKSPACE_ID);
  const { prisma } = await import("../../db");
  return prisma.marketingClient.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: {
      id: true,
      traxyLiveRead: true,
      traxyConnectionName: true,
      traxyMonitoredProfileIds: true,
      traxyLeadTiers: true,
      traxyMinIcpMatchPercent: true,
    },
  });
}

async function loadApolloClients(passed?: readonly ApolloScopeClient[]) {
  if (passed) return [...passed];
  assertProspectSyncWorkspace(WORKSPACE_ID);
  const { prisma } = await import("../../db");
  return prisma.marketingClient.findMany({
    where: { workspaceId: WORKSPACE_ID },
    select: {
      id: true,
      apolloLiveRead: true,
      apolloConnectionName: true,
      apolloListIds: true,
      apolloSavedSearchIds: true,
    },
  });
}

const TRAXY_SPEC = { listEnv: "TRAXY_EXTRA_CONNECTIONS", primaryEnv: "TRAXY_API_KEY", prefix: "TRAXY" } as const;
const APOLLO_SPEC = { listEnv: "APOLLO_EXTRA_CONNECTIONS", primaryEnv: "APOLLO_API_KEY", prefix: "APOLLO" } as const;

function emptySkip(reason: string) {
  return { status: "skipped" as const, reason, written: 0, conflicts: 0, requests: 0 };
}

export async function runTraxySync(options: {
  env?: Env;
  now?: Date;
  clients?: readonly TraxyScopeClient[];
  fetchImpl?: FetchLike;
  store?: ProspectStore;
} = {}) {
  const env = options.env ?? process.env;
  const decision = decideProspectSync(env, "TRAXY_SYNC");
  if (decision.action === "skip") return emptySkip(decision.reason);
  const now = options.now ?? new Date();
  const clients = await loadTraxyClients(options.clients);
  const ready = decision.action === "mock" ? mockReadyNames(env, "TRAXY_EXTRA_CONNECTIONS") : planNamedKeyConnections(env, TRAXY_SPEC).connections.map((row) => row.name);
  const plan = planTraxyPulls(clients, ready);
  if (!plan.pulls.length) return { ...emptySkip(plan.skipped[0]?.reason ?? "no Traxy client is mapped"), skipped: plan.skipped };
  const store = options.store ?? (await prismaStore());
  if (decision.action === "mock") {
    const saved = await persistProspectDrafts(store, plan.pulls.map((pull) => mockProspectDraft("traxy", pull.clientId, now)));
    return { status: "succeeded" as const, mode: "mock" as const, ...saved, requests: 0, skipped: plan.skipped };
  }
  const keys = planNamedKeyConnections(env, TRAXY_SPEC);
  const batches: { clientId: string; people: TraxyPerson[] }[] = [];
  const failures: string[] = [];
  let requests = 0;
  for (const pull of plan.pulls) {
    const key = keys.connections.find((row) => row.name === pull.connectionName);
    if (!key) {
      failures.push("Traxy connection is not ready");
      continue;
    }
    try {
      const listed = await listTraxyLeads({ apiKey: key.apiKey, filters: pull.filters, fetchImpl: options.fetchImpl });
      requests += listed.requests;
      batches.push({ clientId: pull.clientId, people: listed.people });
      if (listed.truncated) failures.push("Traxy page limit reached");
    } catch (error) {
      failures.push(redactProspectSecrets(error instanceof Error ? error.message : "Traxy sync failed", [key.apiKey]));
    }
  }
  const assigned = assignPulledProspects(batches);
  const drafts = assigned.kept.map(({ clientId, person }) => toProspectDraft(WORKSPACE_ID, clientId, "traxy", person, now));
  const saved = drafts.length ? await persistProspectDrafts(store, drafts) : { written: 0, conflicts: 0 };
  return {
    status: failures.length ? ("failed" as const) : ("succeeded" as const),
    mode: "live" as const,
    written: saved.written,
    conflicts: saved.conflicts + assigned.conflicts.length,
    requests,
    skipped: plan.skipped,
    reason: failures[0],
  };
}

export async function runApolloSync(options: {
  env?: Env;
  now?: Date;
  clients?: readonly ApolloScopeClient[];
  fetchImpl?: FetchLike;
  store?: ProspectStore;
} = {}) {
  const env = options.env ?? process.env;
  const decision = decideProspectSync(env, "APOLLO_SYNC");
  if (decision.action === "skip") return emptySkip(decision.reason);
  const now = options.now ?? new Date();
  const clients = await loadApolloClients(options.clients);
  const ready = decision.action === "mock" ? mockReadyNames(env, "APOLLO_EXTRA_CONNECTIONS") : planNamedKeyConnections(env, APOLLO_SPEC).connections.map((row) => row.name);
  const plan = planApolloPulls(clients, ready);
  if (!plan.pulls.length) return { ...emptySkip(plan.skipped[0]?.reason ?? "no Apollo client is mapped"), skipped: plan.skipped };
  const store = options.store ?? (await prismaStore());
  if (decision.action === "mock") {
    const saved = await persistProspectDrafts(store, plan.pulls.map((pull) => mockProspectDraft("apollo", pull.clientId, now)));
    return { status: "succeeded" as const, mode: "mock" as const, ...saved, requests: 0, skipped: plan.skipped };
  }
  const keys = planNamedKeyConnections(env, APOLLO_SPEC);
  const batches: { clientId: string; people: ApolloPerson[] }[] = [];
  const failures: string[] = [];
  let requests = 0;
  for (const pull of plan.pulls) {
    const key = keys.connections.find((row) => row.name === pull.connectionName);
    if (!key) {
      failures.push("Apollo connection is not ready");
      continue;
    }
    try {
      const listed = await listApolloContacts({ apiKey: key.apiKey, filters: pull.filters, fetchImpl: options.fetchImpl });
      requests += listed.requests;
      batches.push({ clientId: pull.clientId, people: listed.people });
      if (listed.truncated) failures.push("Apollo page limit reached");
    } catch (error) {
      failures.push(redactProspectSecrets(error instanceof Error ? error.message : "Apollo sync failed", [key.apiKey]));
    }
  }
  const assigned = assignPulledProspects(batches);
  const drafts = assigned.kept.map(({ clientId, person }) => toProspectDraft(WORKSPACE_ID, clientId, "apollo", person, now));
  const saved = drafts.length ? await persistProspectDrafts(store, drafts) : { written: 0, conflicts: 0 };
  return {
    status: failures.length ? ("failed" as const) : ("succeeded" as const),
    mode: "live" as const,
    written: saved.written,
    conflicts: saved.conflicts + assigned.conflicts.length,
    requests,
    skipped: plan.skipped,
    reason: failures[0],
  };
}

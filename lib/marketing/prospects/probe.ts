import { decideProspectSync, type Env } from "../config";
import { apolloCount, apolloRequest, apolloSearchBody, APOLLO_ORIGIN, mapApolloContact } from "./apollo";
import { connectionNameOf, planNamedKeyConnections } from "./connections";
import { asRecord } from "./guard";
import { normalizeApolloIds } from "./scope";
import { listTraxyLeads, traxyCountTotal, traxyDateRange, traxyRequest, TRAXY_ORIGIN } from "./traxy";
import type { FetchLike } from "./guard";

export type ProbeSummary = {
  connection: string;
  source: "traxy" | "apollo";
  count: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  truncated: boolean;
};

const TRAXY_SPEC = { listEnv: "TRAXY_EXTRA_CONNECTIONS", primaryEnv: "TRAXY_API_KEY", prefix: "TRAXY" } as const;
const APOLLO_SPEC = { listEnv: "APOLLO_EXTRA_CONNECTIONS", primaryEnv: "APOLLO_API_KEY", prefix: "APOLLO" } as const;

export function probeKey(env: Env, source: "traxy" | "apollo", connection: string) {
  const flag = source === "traxy" ? "TRAXY_SYNC" : "APOLLO_SYNC";
  const decision = decideProspectSync(env, flag);
  if (decision.action === "mock") return { ok: false as const, reason: "MARKETING_SYNC_MODE=mock" };
  if (decision.action === "skip") return { ok: false as const, reason: decision.reason };
  const plan = planNamedKeyConnections(env, source === "traxy" ? TRAXY_SPEC : APOLLO_SPEC);
  const name = connectionNameOf(connection);
  const found = plan.connections.find((row) => row.name === name);
  if (!found) {
    const skip = plan.skipped.find((row) => row.name === name);
    return { ok: false as const, reason: skip?.reason ?? `unknown connection ${name}` };
  }
  return { ok: true as const, name, apiKey: found.apiKey, apiKeyEnv: found.apiKeyEnv };
}

export function publicProbeLine(summary: ProbeSummary, secrets: string[]) {
  const line = JSON.stringify(summary);
  for (const secret of secrets) {
    if (secret.trim().length >= 6 && line.includes(secret)) throw new Error("Refusing to print a response that contained the API key.");
  }
  return line;
}

export async function probeTraxy(input: { apiKey: string; connection: string; fetchImpl?: FetchLike }): Promise<ProbeSummary> {
  const counts = await traxyRequest({
    apiKey: input.apiKey,
    url: `${TRAXY_ORIGIN}/api/v1/customer/leads/counts`,
    fetchImpl: input.fetchImpl,
  });
  const listed = await listTraxyLeads({
    apiKey: input.apiKey,
    filters: { monitoredProfileIds: [], leadTiers: [], minIcpMatchPercent: null },
    fetchImpl: input.fetchImpl,
    maxPages: 10,
  });
  const range = traxyDateRange(listed.people);
  return {
    connection: input.connection,
    source: "traxy",
    count: traxyCountTotal(counts),
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    truncated: listed.truncated,
  };
}

export async function probeApollo(input: { apiKey: string; connection: string; listIds: string[]; fetchImpl?: FetchLike }): Promise<ProbeSummary> {
  const lists = normalizeApolloIds(input.listIds, "Apollo list ids");
  if (!lists.ok) throw new Error(lists.reason);
  const filters = { listIds: lists.ids };
  const bodyFor = (ascending: boolean) => apolloSearchBody(filters, 1, {
    per_page: 1,
    sort_by_field: "contact_created_at",
    sort_ascending: ascending,
  });
  const oldest = await apolloRequest({
    apiKey: input.apiKey,
    method: "POST",
    url: `${APOLLO_ORIGIN}/api/v1/contacts/search`,
    body: bodyFor(true),
    fetchImpl: input.fetchImpl,
  });
  const newest = await apolloRequest({
    apiKey: input.apiKey,
    method: "POST",
    url: `${APOLLO_ORIGIN}/api/v1/contacts/search`,
    body: bodyFor(false),
    fetchImpl: input.fetchImpl,
  });
  const firstContact = (body: unknown) => {
    const contacts = asRecord(body).contacts;
    return Array.isArray(contacts) ? contacts[0] : null;
  };
  const stamps = [oldest, newest]
    .map((body) => mapApolloContact(firstContact(body))?.seenAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  return {
    connection: input.connection,
    source: "apollo",
    count: apolloCount(oldest),
    dateFrom: stamps.length ? new Date(Math.min(...stamps)).toISOString() : null,
    dateTo: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null,
    truncated: false,
  };
}

/**
 * LinkedIn read stub.
 * There is no live LinkedIn Marketing API client yet.
 * Mock mode returns a sample and does not call the network.
 * Reads stay read-only. Budget writes are refused before any fetch.
 */

import { integrationsMode, type Env } from "../../env";
import { assertNoAdBudgetWrite } from "./budget-lock";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const LINKEDIN_SAMPLE_URL = "https://api.linkedin.com/rest/adAccountUsers";

export async function readLinkedInSample(input: { env?: Env; fetchImpl?: FetchLike } = {}) {
  const env = input.env ?? process.env;
  assertNoAdBudgetWrite({ method: "GET", url: LINKEDIN_SAMPLE_URL });
  if (integrationsMode(env) !== "live") {
    return { readOnly: true as const, campaigns: 3, sample: [{ name: "Example campaign", leads: 2 }] };
  }
  const fetchImpl = input.fetchImpl;
  if (!fetchImpl) throw new Error("LinkedIn live reads need an injected fetch. The stub does not call the network.");
  const response = await fetchImpl(LINKEDIN_SAMPLE_URL, { method: "GET" });
  return { readOnly: true as const, campaigns: 0, status: response.status, sample: [] as { name: string; leads: number }[] };
}

import { assertOutboundOpen } from "../../demo/outbound";
import type { Env } from "../config";

/** Read one page of opportunities. The response body is not logged. */
export async function pullGhlOpportunities(env: Env, fetchImpl: typeof fetch) {
  assertOutboundOpen("ghl");
  const key = (env.GHL_API_KEY || "").trim();
  const location = (env.GHL_LOCATION_ID || "").trim();
  if (!key || !location) return { opportunities: [] as unknown[], status: null as number | null };
  const url = new URL("https://services.leadconnectorhq.com/opportunities/search");
  url.searchParams.set("location_id", location);
  url.searchParams.set("limit", "100");
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });
  if (!response.ok) return { opportunities: [], status: response.status };
  const body = (await response.json()) as { opportunities?: unknown; data?: unknown };
  const list = Array.isArray(body.opportunities) ? body.opportunities : Array.isArray(body.data) ? body.data : [];
  return { opportunities: list, status: response.status };
}

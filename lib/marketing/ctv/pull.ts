import { addDaysISO, zonedISODate } from "../../time";
import { lookbackDays, type Env } from "../config";
import { stackAdaptGet, type FetchLike } from "../connectors/stackadapt-client";
import { registerCtvAdapter, type CtvPlatformAdapter, type CtvPullRequest } from "./adapter";
import { exampleCtvPull } from "./fixtures";
import { STACKADAPT_DATE_PARAMS, STACKADAPT_UNVERIFIED_PATHS } from "./fields";
import { parseDeliveryRows, parseExposures, parseNativeWindow, parsePlatformLifts } from "./parse";
import type { CtvPull } from "./types";

function emptyPull(warning: string, exampleData: boolean): CtvPull {
  return {
    platform: "stackadapt",
    exampleData,
    warnings: warning ? [warning] : [],
    delivery: [],
    exposures: [],
    households: [],
    conversions: [],
    nativeWindow: parseNativeWindow(null),
    platformLifts: [],
  };
}

export async function pullStackAdaptCtv(input: { apiKey: string; from: string; to: string; fetchImpl?: FetchLike }): Promise<CtvPull> {
  const query = { [STACKADAPT_DATE_PARAMS.start]: input.from, [STACKADAPT_DATE_PARAMS.end]: input.to };
  const warnings: string[] = [];
  const deliveryBody = await stackAdaptGet({ apiKey: input.apiKey, path: "/delivery", query, fetchImpl: input.fetchImpl });
  const parsed = parseDeliveryRows(deliveryBody);
  if (!parsed.rows.length) {
    const stats = await stackAdaptGet({ apiKey: input.apiKey, path: "/stats", query, fetchImpl: input.fetchImpl });
    parsed.rows.push(...parseDeliveryRows(stats).rows);
  }
  if (parsed.skipped) warnings.push(`Skipped ${parsed.skipped} non-CTV rows.`);
  const trackers = await stackAdaptGet({ apiKey: input.apiKey, path: "/conversion_trackers", fetchImpl: input.fetchImpl });
  const nativeWindow = parseNativeWindow(trackers);
  if (nativeWindow.source === "missing") warnings.push(nativeWindow.label);
  const exposures = parseExposures(await stackAdaptGet({ apiKey: input.apiKey, path: "/conversion_paths", query, fetchImpl: input.fetchImpl, optional: true }));
  const lifts = [];
  for (const path of STACKADAPT_UNVERIFIED_PATHS) {
    if (path === "/conversion_paths") continue;
    const body = await stackAdaptGet({ apiKey: input.apiKey, path, query, fetchImpl: input.fetchImpl, optional: true });
    if (body == null) {
      warnings.push(`${path} was not available. TODO(verify) the REST path.`);
      continue;
    }
    if (path === "/brand_lift_studies") lifts.push(...parsePlatformLifts(body));
    if (path === "/insights/campaign_device" || path === "/insights/campaign_supply_source") {
      const extra = parseDeliveryRows(body);
      parsed.rows.push(...extra.rows);
    }
  }
  if (!exposures.length) warnings.push("No event-level exposures were in the reporting response. Household links stay empty until that export exists. TODO(verify).");
  return {
    platform: "stackadapt",
    exampleData: false,
    warnings,
    delivery: parsed.rows,
    exposures,
    households: [],
    conversions: [],
    nativeWindow,
    platformLifts: lifts,
  };
}

export const stackAdaptCtvAdapter: CtvPlatformAdapter = {
  platform: "stackadapt",
  label: "CTV (StackAdapt)",
  async pull(input: CtvPullRequest) {
    if (input.mode === "mock") return exampleCtvPull();
    const apiKey = (input.apiKey || "").trim();
    if (!apiKey) return exampleCtvPull();
    return pullStackAdaptCtv({ apiKey, from: input.from, to: input.to, fetchImpl: input.fetchImpl });
  },
};

registerCtvAdapter(stackAdaptCtvAdapter);

export function ctvWindow(env: Env, now = new Date(), timeZone = "America/New_York") {
  const until = zonedISODate(now, timeZone);
  const since = addDaysISO(until, -(lookbackDays(env) - 1));
  return { since, until };
}

export { emptyPull };

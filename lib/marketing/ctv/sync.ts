import { decideCtvAttribution, stackAdaptCtvLiveEnabled, type Env } from "../config";
import type { FetchLike } from "../connectors/stackadapt-client";
import { WORKSPACE_ID } from "../types";
import { getCtvAdapter } from "./adapter";
import { exampleCtvPull } from "./fixtures";
import { ctvWindow } from "./pull";
import { buildCtvView, ctvPayloadForViewer, type CtvView } from "./report";
import { releaseCtvAttribution, type CtvAttributionPage } from "./attribution";
import { releaseCtvChannel, type CtvChannelPage } from "./channel";
import { prepareCtvRecords, readCtvPull, saveCtvRecords, type CtvRecords } from "./store";
import type { CtvAudience } from "./types";

export type CtvMemory = {
  saved: CtvRecords | null;
  save(records: CtvRecords): void;
};

export function memoryCtvStore(): CtvMemory {
  const box: CtvMemory = {
    saved: null,
    save(records) {
      box.saved = records;
    },
  };
  return box;
}

export async function runCtvAttributionSync(options: {
  env?: Env;
  now?: Date;
  timezone?: string;
  fetchImpl?: FetchLike;
  store?: CtvMemory;
  workspaceId?: string;
} = {}) {
  const env = options.env ?? process.env;
  const decision = decideCtvAttribution(env);
  if (decision.action === "skip") return { status: "skipped" as const, reason: decision.reason, outbound: 0 };
  const { since, until } = ctvWindow(env, options.now, options.timezone);
  let outbound = 0;
  const pull = decision.action === "mock"
    ? exampleCtvPull()
    : await getCtvAdapter("stackadapt").pull({
        mode: "live",
        from: since,
        to: until,
        apiKey: decision.apiKey,
        fetchImpl: async (url, init) => {
          outbound += 1;
          if (init?.method && init.method !== "GET") throw new Error("CTV pull is read-only GET.");
          if (!options.fetchImpl) throw new Error("Live CTV pull needs a fetch implementation.");
          return options.fetchImpl(url, init);
        },
      });
  const records = prepareCtvRecords(pull, env);
  if (records.holdouts.some((row) => row.uploaded)) {
    throw new Error("Holdout selection is a dry run. Nothing is uploaded or excluded on the platform.");
  }
  if (records.view.budgetsTouched || records.view.segments.some((row) => row.changesSpend || row.writesAds || !row.recommendationOnly)) {
    throw new Error("CTV recommendations are read-only.");
  }
  if (options.store) options.store.save(records);
  else await saveCtvRecords(options.workspaceId ?? WORKSPACE_ID, records, options.now ?? new Date());
  return { status: "succeeded" as const, mode: decision.action, outbound, since, until, view: records.view };
}

/** Empty attribution view used when stored StackAdapt rows replace the example page. */
export function ctvViewWithoutExample(): CtvView {
  return buildCtvView({
    platform: "stackadapt",
    exampleData: false,
    warnings: [],
    delivery: [],
    exposures: [],
    households: [],
    conversions: [],
    nativeWindow: {
      clickDays: null,
      viewDays: null,
      source: "stackadapt",
      label: "CTV (StackAdapt) native window follows each conversion pixel.",
    },
    platformLifts: [],
  });
}

export async function loadCtvAttributionView(env: Env = process.env): Promise<CtvView> {
  const decision = decideCtvAttribution(env);
  if (decision.action === "skip") {
    return buildCtvView({ ...exampleCtvPull(), exampleData: false, exposures: [], conversions: [], delivery: [], households: [], warnings: ["CTV attribution is turned off."] }, { env });
  }
  if (decision.action === "mock") return buildCtvView(exampleCtvPull(), { env });
  try {
    const stored = await readCtvPull();
    if (!stored) {
      return buildCtvView({ ...exampleCtvPull(), exampleData: false, exposures: [], conversions: [], delivery: [], households: [], warnings: ["No CTV (StackAdapt) rows stored yet."] }, { env });
    }
    return buildCtvView(stored, { env });
  } catch {
    return buildCtvView({ ...exampleCtvPull(), exampleData: false, exposures: [], conversions: [], delivery: [], households: [], warnings: ["CTV attribution is not available yet."] }, { env });
  }
}

export async function attachShareCtv<T extends object>(
  payload: T,
  env: Env = process.env,
  loadChannel?: () => Promise<CtvChannelPage | null>,
  loadAttribution?: () => Promise<CtvAttributionPage | null>,
): Promise<T & { ctv?: unknown; ctvChannel?: unknown; ctvAttribution?: unknown }> {
  let next: T & { ctv?: unknown; ctvChannel?: unknown; ctvAttribution?: unknown } = payload;
  const live = stackAdaptCtvLiveEnabled(env);
  if (!decisionOff(env) && !live) {
    const view = await loadCtvAttributionView(env);
    next = { ...next, ctv: ctvPayloadForViewer(view, "share" satisfies CtvAudience) };
  }
  if (!live) return next;
  const channel = loadChannel ? await loadChannel() : await loadShareChannel(env);
  if (channel) next = { ...next, ctvChannel: releaseCtvChannel(channel, "share") };
  const attribution = loadAttribution ? await loadAttribution() : await loadShareAttribution(env);
  if (!attribution) return next;
  return { ...next, ctvAttribution: releaseCtvAttribution(attribution, "share") };
}

async function loadShareChannel(env: Env) {
  try {
    const { loadPlanCtv } = await import("./channel-query");
    return loadPlanCtv("", env);
  } catch {
    return null;
  }
}

async function loadShareAttribution(env: Env) {
  try {
    const { loadPlanAttribution } = await import("./attribution-query");
    return loadPlanAttribution("", env);
  } catch {
    return null;
  }
}

function decisionOff(env: Env) {
  return decideCtvAttribution(env).action === "skip";
}

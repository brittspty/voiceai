import type { FetchLike } from "../connectors/stackadapt-client";
import type { CtvPlatformId, CtvPull } from "./types";

export type CtvPullRequest = {
  from: string;
  to: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  mode: "mock" | "live";
};

/** One platform implements this. Others can register later. */
export interface CtvPlatformAdapter {
  platform: string;
  label: string;
  pull(input: CtvPullRequest): Promise<CtvPull>;
}

const adapters = new Map<string, CtvPlatformAdapter>();

export function registerCtvAdapter(adapter: CtvPlatformAdapter) {
  adapters.set(adapter.platform, adapter);
  return adapter;
}

export function getCtvAdapter(platform: string) {
  const adapter = adapters.get(platform);
  if (!adapter) throw new Error(`No CTV adapter for ${platform}.`);
  return adapter;
}

export function listCtvAdapters() {
  return [...adapters.values()];
}

export function isStackAdapt(platform: string): platform is CtvPlatformId {
  return platform === "stackadapt";
}

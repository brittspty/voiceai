import { emptySnapshot } from "../types";
import { recommendStackAdapt, stackAdaptToSnapshot, type StackAdaptRecommendation } from "./stackadapt-map";
import { pullStackAdaptBundle, redactStackAdaptSecrets, type FetchLike } from "./stackadapt-client";

export type StackAdaptPullInput = {
  apiKey: string;
  since: string;
  until: string;
  fetchImpl?: FetchLike;
};

export async function pullStackAdaptSnapshot(input: StackAdaptPullInput): Promise<{
  snapshot: ReturnType<typeof emptySnapshot>;
  failures: string[];
  recommendations: StackAdaptRecommendation[];
}> {
  try {
    const bundle = await pullStackAdaptBundle({
      apiKey: input.apiKey,
      from: input.since,
      to: input.until,
      fetchImpl: input.fetchImpl,
    });
    const snapshot = stackAdaptToSnapshot(bundle);
    return { snapshot, failures: [], recommendations: recommendStackAdapt(snapshot, input.until) };
  } catch (error) {
    const message = redactStackAdaptSecrets(error instanceof Error ? error.message : "StackAdapt pull failed", [input.apiKey]);
    const snapshot = emptySnapshot();
    snapshot.warnings.push(message);
    return { snapshot, failures: [message], recommendations: [] };
  }
}

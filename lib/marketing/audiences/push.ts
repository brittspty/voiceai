import type { Env } from "../config";
import { audiencePushEnabled } from "../config";
import { assertNoAdBudgetWrite } from "../connectors/budget-lock";
import { assertGoogleCustomerMatch } from "./google-policy";
import { LEGACY_AUDIENCE_SOURCE, type AudienceSource } from "../segment-taxonomy";
import { redactMaids } from "./maid";
import {
  buildPlatformPayload,
  manualUploadSteps,
  platformUploadUrl,
  type AudiencePlatform,
  type UploadMember,
} from "./payloads";

export type AudienceFetch = (url: string, init: { method: "POST"; body: string }) => Promise<{ status: number }>;

export type PushDelivery = {
  mode: "dry_run" | "live";
  called: boolean;
  status: number | null;
  log: string;
  steps: string[];
  payload: unknown;
  endpoint: string;
};

export function liveAudienceWrite(input: { endpoint: string; body: string; fetchImpl: AudienceFetch }) {
  assertNoAdBudgetWrite({ method: "POST", url: input.endpoint, body: input.body });
  if (!input.endpoint.startsWith("https://")) throw new Error("A live audience upload needs an https endpoint.");
  return input.fetchImpl(input.endpoint, { method: "POST", body: input.body });
}

/**
 * Approving a push logs the payload and the manual steps.
 * The live write runs only when AUDIENCE_PUSH_ENABLED is on and the endpoint is https.
 */
export async function deliverAudienceUpload(input: {
  env: Env;
  platform: AudiencePlatform;
  payload: unknown;
  listId: string;
  vendor: string;
  source?: AudienceSource | string;
  accountId?: string | null;
  fetchImpl?: AudienceFetch;
}): Promise<PushDelivery> {
  assertGoogleCustomerMatch({
    platform: input.platform,
    source: input.source || "data_market_maid",
    accountId: input.accountId,
    env: input.env,
  });
  const endpoint = platformUploadUrl(input.platform, input.env);
  assertNoAdBudgetWrite({ method: "POST", url: endpoint, body: input.payload });
  const steps = manualUploadSteps(input.platform, input.listId, input.vendor);
  const body = JSON.stringify(input.payload);
  const base = redactMaids(JSON.stringify({ platform: input.platform, endpoint, payload: input.payload }));
  if (!audiencePushEnabled(input.env) || !endpoint.startsWith("https://") || !input.fetchImpl) {
    const reason = !audiencePushEnabled(input.env)
      ? "Live upload is off. Logged only."
      : "No https upload URL is set. Logged only.";
    return { mode: "dry_run", called: false, status: null, log: `${base} ${reason}`, steps, payload: input.payload, endpoint };
  }
  const response = await liveAudienceWrite({ endpoint, body, fetchImpl: input.fetchImpl });
  return {
    mode: "live",
    called: true,
    status: response.status,
    log: `${base} Live upload returned ${response.status}.`,
    steps,
    payload: input.payload,
    endpoint,
  };
}

export function prepareAudiencePush(input: {
  source: AudienceSource;
  platform: AudiencePlatform;
  members: UploadMember[];
  consentBasis: string;
  accountId?: string | null;
  env?: Env;
}) {
  if (input.source === LEGACY_AUDIENCE_SOURCE) {
    throw new Error("Platform-native targeting is a legacy import. It is not uploaded.");
  }
  assertGoogleCustomerMatch({
    platform: input.platform,
    source: input.source,
    accountId: input.accountId,
    env: input.env,
  });
  if (!input.members.length) throw new Error("This audience has no hashed identifiers to upload.");
  const payload = buildPlatformPayload(input.platform, input.members, input.consentBasis);
  assertNoAdBudgetWrite({ method: "POST", url: platformUploadUrl(input.platform, input.env), body: payload });
  return payload;
}

export function assertHumanPushActor(actor: { kind: string }) {
  if (actor.kind !== "human") throw new Error("Only a person can decide an audience push.");
}

export const AUDIENCE_UNDO_MS = 30_000;

export type AudienceDecision = "yes" | "no" | "undo";

export type PushCard = {
  status: "pending" | "approved" | "declined";
  undoUntil: string | null;
  log: string;
  steps: string[];
  finalized: boolean;
};

export function audienceUndoToast(secondsLeft: number) {
  return `Approved. Undo · ${Math.max(0, Math.ceil(secondsLeft))}s`;
}

export function normalizeAudienceDecision(value: string): AudienceDecision | null {
  if (value === "yes" || value === "approve") return "yes";
  if (value === "no" || value === "decline") return "no";
  if (value === "undo") return "undo";
  return null;
}

/** Yes waits 30 seconds. Undo puts it back. The upload itself stays a dry run. */
export function applyPushDecision(card: PushCard, action: AudienceDecision, now: Date): PushCard {
  if (action === "undo") {
    if (card.status !== "approved" || !card.undoUntil) return card;
    if (Date.parse(card.undoUntil) <= now.getTime()) return card;
    return { status: "pending", undoUntil: null, log: "", steps: [], finalized: false };
  }
  if (card.status !== "pending") return card;
  if (action === "no") {
    return { status: "declined", undoUntil: null, log: "No. Nothing was uploaded.", steps: [], finalized: true };
  }
  return {
    status: "approved",
    undoUntil: new Date(now.getTime() + AUDIENCE_UNDO_MS).toISOString(),
    log: `${audienceUndoToast(30)} Dry run. Nothing is sent yet.`,
    steps: [],
    finalized: false,
  };
}

/** After the undo window, write the dry-run log. This never means a live upload. */
export function finalizePush(card: PushCard, now: Date, dryRun: { log: string; steps: string[] }) {
  if (card.status !== "approved" || card.finalized || !card.undoUntil) return { card, write: false };
  if (Date.parse(card.undoUntil) > now.getTime()) return { card, write: false };
  return {
    card: { ...card, undoUntil: null, log: dryRun.log, steps: dryRun.steps, finalized: true },
    write: true,
  };
}

export function pushStatusLabel(status: string, undoUntil: string | null, now: Date) {
  if (status === "declined") return "No";
  if (status === "approved" && undoUntil && Date.parse(undoUntil) > now.getTime()) return "Yes · Undo open";
  if (status === "approved") return "Dry run logged";
  return "Waiting for Yes";
}

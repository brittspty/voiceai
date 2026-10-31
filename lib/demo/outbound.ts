import { AsyncLocalStorage } from "node:async_hooks";
import { DEMO_WORKSPACE_ID } from "./isolation";

export const OUTBOUND_CHANNELS = ["resend", "twilio", "ghl", "meta", "google", "stackadapt", "tiktok"] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

const workspaceStore = new AsyncLocalStorage<string>();

export function runAsWorkspace<T>(workspaceId: string, fn: () => T): T {
  return workspaceStore.run(workspaceId, fn);
}

export function currentWorkspaceId() {
  return workspaceStore.getStore() ?? null;
}

export function demoForcesMock(workspaceId: string | null = currentWorkspaceId()) {
  return workspaceId === DEMO_WORKSPACE_ID;
}

export function integrationsModeForWorkspace(workspaceId: string, env: Record<string, string | undefined> = process.env): "mock" | "live" {
  if (workspaceId === DEMO_WORKSPACE_ID) return "mock";
  return env.INTEGRATIONS_MODE === "live" ? "live" : "mock";
}

export function outboundPlan(workspaceId: string, env: Record<string, string | undefined> = process.env) {
  const demo = workspaceId === DEMO_WORKSPACE_ID;
  return {
    integrationsMode: integrationsModeForWorkspace(workspaceId, env),
    blocked: demo ? [...OUTBOUND_CHANNELS] : [],
  };
}

export class DemoOutboundBlocked extends Error {
  channel: OutboundChannel;

  constructor(channel: OutboundChannel) {
    super(`Demo workspace blocks outbound ${channel}`);
    this.name = "DemoOutboundBlocked";
    this.channel = channel;
  }
}

export function assertOutboundOpen(channel: OutboundChannel, workspaceId: string | null = currentWorkspaceId()) {
  if (workspaceId === DEMO_WORKSPACE_ID) throw new DemoOutboundBlocked(channel);
}

export function channelForUrl(raw: string): OutboundChannel | null {
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "api.resend.com") return "resend";
  if (host === "api.twilio.com" || host.endsWith(".twilio.com") || host === "api.elevenlabs.io") return "twilio";
  if (host === "services.leadconnectorhq.com") return "ghl";
  if (host === "graph.facebook.com") return "meta";
  if (host === "googleads.googleapis.com" || host === "oauth2.googleapis.com") return "google";
  if (host === "api.stackadapt.com") return "stackadapt";
  if (host === "business-api.tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  return null;
}

export function assertUrlOpen(raw: string, workspaceId: string | null = currentWorkspaceId()) {
  const channel = channelForUrl(raw);
  if (!channel) return;
  assertOutboundOpen(channel, workspaceId);
}

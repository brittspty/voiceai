import { randomUUID } from "node:crypto";
import type { Env } from "../config";
import { offlineConversionsEnabled, offlineConversionsLiveEnabled } from "../config";
import { finalizeDecision } from "./decision";
import { hashContact } from "./hash";
import { withFbc, type ParsedOpportunity } from "./click-ids";
import {
  buildGooglePayload,
  buildMetaPayload,
  googleActionReady,
  googleCredentials,
  googleMatchable,
  matchable,
  metaMatchable,
  platformReady,
} from "./payloads";
import type { PlannedUpload } from "./send";
import type {
  AlertRecord,
  ClientRecord,
  ConversionPlatformName,
  CycleState,
  DecisionRecord,
  EventRecord,
  IssueRecord,
  StageKind,
  StageMap,
  UploadRecord,
} from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STOPPED_MS = 6 * 60 * 60 * 1000;
const PLATFORMS: ConversionPlatformName[] = ["meta", "google_ads"];

export function matchClient(clients: ClientRecord[], locationId: string) {
  const location = locationId.trim();
  if (location) {
    const found = clients.find((client) => client.ghlLocationId === location);
    if (found) return found;
  }
  return clients.length === 1 ? clients[0] : null;
}

export function matchStage(stages: StageMap[], stageId: string, stageName: string) {
  const id = stageId.trim().toLowerCase();
  const name = stageName.trim().toLowerCase();
  if (id) {
    const byId = stages.find((stage) => stage.ghlStageId.trim().toLowerCase() === id);
    if (byId) return byId;
  }
  if (name) {
    return stages.find((stage) => stage.ghlStageName.trim().toLowerCase() === name || stage.kind === name) ?? null;
  }
  return null;
}

export type IngestPlan = {
  status: "flag_off" | "no_client" | "not_enabled" | "unmapped" | "duplicate" | "created";
  event: EventRecord | null;
  issue: IssueRecord | null;
};

export function planIngest(input: {
  opportunity: ParsedOpportunity;
  email: string;
  phone: string;
  clients: ClientRecord[];
  contactId: string | null;
  existingKeys: { clientId: string; externalId: string; kind: StageKind }[];
  env: Env;
  now: Date;
  eventId?: string;
  issueId?: string;
}): IngestPlan {
  if (!offlineConversionsEnabled(input.env)) return { status: "flag_off", event: null, issue: null };
  const client = matchClient(input.clients, input.opportunity.locationId);
  if (!client) return { status: "no_client", event: null, issue: null };
  if (!client.enabledAt) return { status: "not_enabled", event: null, issue: null };
  const stage = matchStage(client.stages, input.opportunity.stageId, input.opportunity.stageName);
  if (!stage) {
    return {
      status: "unmapped",
      event: null,
      issue: {
        id: input.issueId ?? randomUUID(),
        clientId: client.id,
        code: "unmapped_stage",
        platform: "",
        occurredAt: input.opportunity.occurredAt,
      },
    };
  }
  if (input.existingKeys.some((key) => key.clientId === client.id && key.externalId === input.opportunity.opportunityId && key.kind === stage.kind)) {
    return { status: "duplicate", event: null, issue: null };
  }
  const hashes = hashContact(input.email, input.phone);
  const attribution = withFbc(input.opportunity.attribution, Date.parse(input.opportunity.occurredAt));
  const valueCents = input.opportunity.valueCents ?? stage.valueCents;
  const event: EventRecord = {
    id: input.eventId ?? randomUUID(),
    clientId: client.id,
    contactId: input.contactId,
    source: "ghl",
    externalId: input.opportunity.opportunityId,
    kind: stage.kind,
    stageName: stage.ghlStageName,
    valueCents,
    currency: input.opportunity.currency || stage.currency || "USD",
    occurredAt: input.opportunity.occurredAt,
    ...attribution,
    ...hashes,
  };
  return { status: "created", event, issue: null };
}

export function rateFor(events: EventRecord[], platform: ConversionPlatformName, now: number, startAgo: number, endAgo: number) {
  const end = now - endAgo;
  const start = now - startAgo;
  const rows = events.filter((event) => {
    const time = Date.parse(event.occurredAt);
    return time > start && time <= end;
  });
  if (!rows.length) return { rate: null as number | null, matched: 0, total: 0 };
  const matched = rows.filter((event) => matchable(platform, event)).length;
  return { rate: Math.round((matched / rows.length) * 100), matched, total: rows.length };
}

function stageFor(client: ClientRecord, event: EventRecord) {
  return (
    client.stages.find((stage) => stage.kind === event.kind && stage.ghlStageName === event.stageName) ??
    client.stages.find((stage) => stage.kind === event.kind) ??
    null
  );
}

function platformLabel(platform: ConversionPlatformName) {
  return platform === "meta" ? "Meta" : "Google";
}

type DesiredAlert = Pick<AlertRecord, "severity" | "code" | "title" | "summary">;

function desiredAlert(
  client: ClientRecord,
  platform: ConversionPlatformName,
  events: EventRecord[],
  uploads: UploadRecord[],
  live: boolean,
  now: number,
): DesiredAlert | null {
  const label = platformLabel(platform);
  const recent = uploads.filter((upload) => upload.platform === platform && Date.parse(upload.createdAt) >= now - WEEK_MS);
  if (recent.some((upload) => upload.errorCode === "token_expired")) {
    return {
      severity: "critical",
      code: "token_expired",
      title: `${label} token expired`,
      summary: `${label} stopped accepting updates because the token expired.`,
    };
  }
  const lastSent = uploads.reduce((max, upload) => {
    if (upload.platform !== platform || upload.status !== "sent" || !upload.sentAt) return max;
    return Math.max(max, Date.parse(upload.sentAt));
  }, 0);
  if (live && client.enabledAt && lastSent && now - lastSent > STOPPED_MS) {
    return {
      severity: "critical",
      code: "sending_stopped",
      title: `${label} sending stopped`,
      summary: `${label} has not accepted an update for more than 6 hours.`,
    };
  }
  const current = rateFor(events, platform, now, WEEK_MS, 0);
  const previous = rateFor(events, platform, now, WEEK_MS * 2, WEEK_MS);
  if (current.rate != null && previous.rate != null && previous.total >= 5 && previous.rate - current.rate > 15) {
    return {
      severity: "warning",
      code: "match_rate_drop",
      title: `${label} match rate dropped`,
      summary: `${label} match rate fell by more than 15 points from last week.`,
    };
  }
  return null;
}

function rank(severity: string) {
  if (severity === "critical") return 2;
  if (severity === "warning") return 1;
  return 0;
}

export type CyclePlan = {
  decisions: DecisionRecord[];
  enabled: { clientId: string; enabledAt: string }[];
  uploads: PlannedUpload[];
  alerts: AlertRecord[];
  resolveAlertIds: string[];
};

export function planCycle(state: CycleState, env: Env, now: Date, ids: () => string = randomUUID, timeZone = "America/New_York"): CyclePlan {
  const decisions: DecisionRecord[] = [];
  const enabled: { clientId: string; enabledAt: string }[] = [];
  if (offlineConversionsEnabled(env)) {
    for (const decision of state.decisions) {
      const undoUntil = decision.undoUntil;
      const result = finalizeDecision(decision, now);
      decisions.push(result.decision);
      if (result.enable && undoUntil) {
        const client = state.clients.find((row) => row.id === decision.clientId);
        if (client && !client.enabledAt) enabled.push({ clientId: client.id, enabledAt: undoUntil });
      }
    }
  } else {
    decisions.push(...state.decisions);
  }
  const clients = state.clients.map((client) => {
    const turn = enabled.find((row) => row.clientId === client.id);
    return turn ? { ...client, enabledAt: turn.enabledAt } : client;
  });
  const uploads: PlannedUpload[] = [];
  const live = offlineConversionsLiveEnabled(env);
  if (offlineConversionsEnabled(env)) {
    for (const event of state.events) {
      const client = clients.find((row) => row.id === event.clientId);
      if (!client?.enabledAt) continue;
      const stage = stageFor(client, event);
      for (const platform of PLATFORMS) {
        if (state.uploads.some((upload) => upload.eventId === event.id && upload.platform === platform)) continue;
        const payload =
          platform === "meta"
            ? buildMetaPayload(event, stage?.metaEventName || "Lead")
            : buildGooglePayload(event, stage?.googleAction || "", googleCredentials(env)?.customerId || "", timeZone);
        const canMatch = platform === "meta" ? metaMatchable(event) : googleMatchable(event);
        const hashesMissing = !(event.emailHashMeta || event.phoneHashMeta);
        let status: UploadRecord["status"] = "dry_run";
        let errorCode = "";
        let errorMessage = "";
        let send = false;
        if (!canMatch) {
          status = "skipped";
          errorCode = hashesMissing ? "no_email_or_phone" : "no_click_id";
          errorMessage = hashesMissing ? "No email or phone to match." : "No click id to match.";
        } else if (live && platform === "google_ads" && !googleActionReady(stage?.googleAction || "", googleCredentials(env)?.customerId || "")) {
          status = "skipped";
          errorCode = "missing_conversion_action";
          errorMessage = "Add the Google conversion action id.";
        } else if (live && platformReady(platform, env)) {
          send = true;
        }
        uploads.push({
          id: ids(),
          eventId: event.id,
          platform,
          status,
          payload,
          attempts: 0,
          errorCode,
          errorMessage,
          createdAt: now.toISOString(),
          sentAt: null,
          send,
        });
      }
    }
  }
  const combined = [...state.uploads, ...uploads];
  const alerts: AlertRecord[] = [];
  const resolveAlertIds: string[] = [];
  if (offlineConversionsEnabled(env)) {
    for (const client of clients) {
      const events = state.events.filter((event) => event.clientId === client.id);
      for (const platform of PLATFORMS) {
        const key = `${client.id}:offline_conversions:${platform}`;
        const mine = state.alerts.filter((alert) => alert.dedupeKey === key);
        const muted = mine.some((alert) => alert.mutedUntil && Date.parse(alert.mutedUntil) > now.getTime());
        const open = mine.filter((alert) => !alert.resolvedAt);
        const eventIds = new Set(events.map((event) => event.id));
        const desired = desiredAlert(
          client,
          platform,
          events,
          combined.filter((upload) => upload.platform === platform && eventIds.has(upload.eventId)),
          live && platformReady(platform, env),
          now.getTime(),
        );
        if (!desired) {
          for (const alert of open) resolveAlertIds.push(alert.id);
          continue;
        }
        const blocking = mine.filter(
          (alert) => now.getTime() - Date.parse(alert.firedAt) < COOLDOWN_MS && rank(alert.severity) >= rank(desired.severity),
        );
        const sameOpen = open.some((alert) => alert.code === desired.code);
        if (!muted && !sameOpen && blocking.length === 0) {
          alerts.push({
            id: ids(),
            clientId: client.id,
            platform,
            severity: desired.severity,
            code: desired.code,
            dedupeKey: key,
            title: desired.title,
            summary: desired.summary,
            firedAt: now.toISOString(),
            resolvedAt: null,
            mutedUntil: null,
          });
        }
        for (const alert of open) {
          if (alert.code !== desired.code) resolveAlertIds.push(alert.id);
        }
      }
    }
  }
  return { decisions, enabled, uploads, alerts, resolveAlertIds };
}

export { metaMatchable, googleMatchable };

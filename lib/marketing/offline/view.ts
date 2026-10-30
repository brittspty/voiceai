import type { Env } from "../config";
import { offlineConversionsEnabled, offlineConversionsLiveEnabled } from "../config";
import { cardExpiryLabel, decisionCardCopy, stagesReady } from "./decision";
import { normalizeCustomerId } from "../config";
import { googleCredentials, metaCredentials, normalizeDatasetId, platformReady } from "./payloads";
import { rateFor } from "./pipeline";
import type { ClientRecord, ConversionPlatformName, CycleState, DecisionRecord, EventRecord, StageKind, UploadRecord } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const KIND_LABEL: Record<StageKind, string> = {
  qualified: "Qualified lead",
  booked: "Booked call",
  sold: "Sold",
};

export type FeedbackError = {
  code: string;
  count: number;
  cause: string;
  fix: string;
};

export type PlatformRow = {
  platform: ConversionPlatformName;
  label: string;
  status: "sending" | "needs_attention" | "not_connected" | "dry_run";
  statusLabel: string;
  lastSentLabel: string;
  matchRate: number | null;
  matchRateLabel: string;
  matchHint: string;
  eventsLabel: string;
  events: { label: string; count: number }[];
  valueLabel?: string;
  errorCount: number;
  errors: FeedbackError[];
  technicalDetails: string;
};

export type ConversionFeedbackView = {
  featureOn: boolean;
  liveOn: boolean;
  seesValue: boolean;
  exampleData: boolean;
  empty: boolean;
  emptyCopy: string;
  successCopy: string | null;
  errorBanner: string | null;
  banner: string;
  platforms: PlatformRow[];
  clients: {
    id: string;
    name: string;
    locationId: string;
    metaDatasetId: string;
    googleCustomerId: string;
    enabled: boolean;
    statusLabel: string;
    stages: {
      id: string;
      name: string;
      kind: StageKind;
      stageId: string;
      metaEventName: string;
      googleAction: string;
      valueCents?: number;
      valueLabel?: string;
    }[];
    decision: null | {
      id: string;
      status: string;
      tag: string;
      tier: string;
      clientLabel: string;
      expiry: string;
      headline: string;
      fix: string;
      impact: string;
      confidence: string;
      evidence: string;
      undoSeconds: number | null;
      undoUntil: string | null;
      canApprove: boolean;
      canUndo: boolean;
    };
  }[];
};

function platformLabel(platform: ConversionPlatformName) {
  return platform === "meta" ? "Meta" : "Google";
}

export function matchHint(rate: number | null) {
  if (rate == null) return "No events in the last 7 days";
  if (rate >= 70) return "Good: above 70%";
  return "Low: below 70%";
}

export function formatDollars(cents: number, currency = "USD") {
  try {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
  } catch {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
}

function lastSentLabel(at: string | null, now: Date, mode: "sent" | "logged" | "none") {
  if (!at || mode === "none") return "Nothing sent yet";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60_000));
  const text = minutes < 60 ? `${Math.max(1, minutes)} min ago` : minutes < 60 * 24 ? `${Math.round(minutes / 60)} hr ago` : `${Math.round(minutes / (60 * 24))} days ago`;
  return mode === "logged" ? `Last logged ${text}` : `Last sent ${text}`;
}

export function stoppedSentence(label: string, at: Date, timeZone: string) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  const zone = timeZone === "America/New_York" ? "ET" : "";
  return `${label} stopped accepting our updates on ${date} at ${time}${zone ? ` ${zone}` : ""}. Reconnect to resume.`;
}

function errorCopy(code: string, count: number, label: string): { cause: string; fix: string } {
  if (code === "no_email_or_phone") {
    return {
      cause: `${count} ${count === 1 ? "lead had" : "leads had"} no email or phone, so ${label} couldn't match them.`,
      fix: "Make phone required on the form.",
    };
  }
  if (code === "no_click_id") {
    return {
      cause: `${count} ${count === 1 ? "lead had" : "leads had"} no click id, so ${label} had less to match.`,
      fix: "Pass the click id from the landing page into GoHighLevel.",
    };
  }
  if (code === "unmapped_stage") {
    return {
      cause: `${count} ${count === 1 ? "opportunity used a stage" : "opportunities used a stage"} that is not mapped.`,
      fix: "Map that stage to booked or sold.",
    };
  }
  if (code === "token_expired") {
    return { cause: `${label} rejected the token.`, fix: "Reconnect. No password is entered here." };
  }
  if (code === "missing_conversion_action") {
    return { cause: `${count} Google ${count === 1 ? "update is" : "updates are"} missing a conversion action id.`, fix: "Add the Google conversion action id." };
  }
  if (code === "missing_dataset") {
    return { cause: `${count} Meta ${count === 1 ? "update has" : "updates have"} no dataset for this client.`, fix: "Add this client's Meta dataset id." };
  }
  if (code === "missing_customer") {
    return { cause: `${count} Google ${count === 1 ? "update has" : "updates have"} no customer id for this client.`, fix: "Add this client's Google Ads customer id." };
  }
  return { cause: `${label} rejected ${count} ${count === 1 ? "update" : "updates"}.`, fix: "Reconnect to resume." };
}

function inLastWeek(iso: string, now: number) {
  const time = Date.parse(iso);
  return time > now - WEEK_MS && time <= now;
}

function latestDecision(decisions: DecisionRecord[], clientId: string) {
  return decisions
    .filter((decision) => decision.clientId === clientId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}

export function buildConversionFeedbackView(input: {
  state: CycleState;
  env: Env;
  now: Date;
  seesValue: boolean;
  timeZone?: string;
  exampleData?: boolean;
}): ConversionFeedbackView {
  const timeZone = input.timeZone || "America/New_York";
  const now = input.now.getTime();
  const featureOn = offlineConversionsEnabled(input.env);
  const liveOn = offlineConversionsLiveEnabled(input.env);
  const platforms = (["meta", "google_ads"] as const).map((platform) => platformRow(platform, input, now, featureOn, liveOn, input.seesValue));
  const empty = platforms.every((row) => row.status === "not_connected");
  const attention = platforms.find((row) => row.status === "needs_attention");
  const waiting = platforms.some((row) => row.status === "sending" && row.lastSentLabel === "Nothing sent yet");
  const clients = input.state.clients.map((client) => clientRow(client, input.state.decisions, input.now, input.seesValue));
  return {
    featureOn,
    liveOn,
    seesValue: input.seesValue,
    exampleData: Boolean(input.exampleData),
    empty,
    emptyCopy: "Send your qualified leads back to Meta and Google so they find more people like them.",
    successCopy: waiting && !attention ? "Connected. First updates arrive within 3 hours." : null,
    errorBanner: attention ? stoppedSentence(attention.label, attentionTime(attention.platform, input.state.uploads, input.now), timeZone) : null,
    banner: !featureOn
      ? "Conversion feedback is off. Nothing is logged or sent."
      : liveOn
        ? "Live sending is on. Only conversion events can be sent, and only for clients you have turned on."
        : "Dry run. Every payload is logged. Nothing is sent.",
    platforms,
    clients,
  };
}

function attentionTime(platform: ConversionPlatformName, uploads: UploadRecord[], now: Date) {
  const times = uploads
    .filter((upload) => upload.platform === platform && (upload.errorCode === "token_expired" || upload.errorCode === "upload_rejected" || upload.status === "failed"))
    .map((upload) => Date.parse(upload.sentAt || upload.createdAt));
  const latest = times.length ? Math.max(...times) : now.getTime();
  return new Date(latest);
}

function platformRow(
  platform: ConversionPlatformName,
  input: { state: CycleState; env: Env; now: Date },
  now: number,
  featureOn: boolean,
  liveOn: boolean,
  seesValue: boolean,
): PlatformRow {
  const label = platformLabel(platform);
  const ready = platformReady(platform, input.env) && input.state.clients.some((client) => {
    if (!client.enabledAt) return false;
    return platform === "meta" ? Boolean(normalizeDatasetId(client.metaDatasetId)) : Boolean(normalizeCustomerId(client.googleCustomerId));
  });
  const events = input.state.events.filter((event) => inLastWeek(event.occurredAt, now));
  const uploads = input.state.uploads.filter((upload) => upload.platform === platform);
  const weekUploads = uploads.filter((upload) => inLastWeek(upload.createdAt, now));
  const rate = rateFor(input.state.events, platform, now, WEEK_MS, 0);
  const sentAt = uploads.filter((upload) => upload.status === "sent" && upload.sentAt).map((upload) => upload.sentAt as string);
  const loggedAt = uploads.filter((upload) => upload.status === "dry_run").map((upload) => upload.createdAt);
  const lastSent = sentAt.sort().at(-1) ?? null;
  const lastLogged = loggedAt.sort().at(-1) ?? null;
  const failed = weekUploads.some((upload) => upload.errorCode === "token_expired" || upload.errorCode === "upload_rejected" || upload.status === "failed");
  const stopped = liveOn && ready && Boolean(lastSent) && now - Date.parse(lastSent as string) > 6 * 60 * 60 * 1000;
  let status: PlatformRow["status"] = "not_connected";
  if (failed || stopped) status = "needs_attention";
  else if (liveOn && ready && (lastSent || input.state.clients.some((client) => client.enabledAt))) status = "sending";
  else if (featureOn && (weekUploads.length || input.state.clients.some((client) => client.enabledAt))) status = "dry_run";
  else if (!ready) status = "not_connected";
  const statusLabel =
    status === "sending" ? "Connected · Sending" : status === "needs_attention" ? "Needs attention" : status === "dry_run" ? "Dry run" : "Not connected";
  const errors = errorGroups(platform, label, events, weekUploads, input.state.issues.filter((issue) => inLastWeek(issue.occurredAt, now)));
  const counts = new Map<StageKind, number>();
  for (const upload of weekUploads) {
    if (upload.status !== "sent" && upload.status !== "dry_run") continue;
    const event = input.state.events.find((row) => row.id === upload.eventId);
    if (!event) continue;
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  const eventRows = (["qualified", "booked", "sold"] as const)
    .filter((kind) => counts.get(kind))
    .map((kind) => ({ label: KIND_LABEL[kind], count: counts.get(kind) ?? 0 }));
  const valueCents = events.reduce((sum, event) => sum + (event.valueCents ?? 0), 0);
  return {
    platform,
    label,
    status,
    statusLabel,
    lastSentLabel: lastSent ? lastSentLabel(lastSent, input.now, "sent") : lastLogged ? lastSentLabel(lastLogged, input.now, "logged") : lastSentLabel(null, input.now, "none"),
    matchRate: rate.rate,
    matchRateLabel: rate.rate == null ? "Match rate —" : `Match rate ${rate.rate}%`,
    matchHint: matchHint(rate.rate),
    eventsLabel: status === "sending" ? "Sent in the last 7 days" : "Prepared in the last 7 days",
    events: eventRows,
    ...(seesValue && valueCents > 0 ? { valueLabel: `Value ${formatDollars(valueCents)}` } : {}),
    errorCount: errors.reduce((sum, error) => sum + error.count, 0),
    errors,
    technicalDetails: errors.map((error) => `${error.code} ${error.count}`).join("\n"),
  };
}

function errorGroups(
  platform: ConversionPlatformName,
  label: string,
  events: EventRecord[],
  uploads: UploadRecord[],
  issues: { code: string; platform: string }[],
): FeedbackError[] {
  const groups: { code: string; count: number }[] = [];
  const missingContact = events.filter((event) => !(platform === "meta" ? event.emailHashMeta || event.phoneHashMeta : event.emailHashGoogle || event.phoneHashGoogle)).length;
  if (missingContact) groups.push({ code: "no_email_or_phone", count: missingContact });
  const missingClick = events.filter((event) => (platform === "meta" ? !(event.fbc || event.fbp || event.fbclid) : !(event.gclid || event.gbraid || event.wbraid))).length;
  if (missingClick) groups.push({ code: "no_click_id", count: missingClick });
  const unmapped = issues.filter((issue) => issue.code === "unmapped_stage").length;
  if (unmapped) groups.push({ code: "unmapped_stage", count: unmapped });
  for (const code of ["token_expired", "upload_rejected", "missing_conversion_action", "missing_dataset", "missing_customer"]) {
    const count = uploads.filter((upload) => upload.errorCode === code).length;
    if (count) groups.push({ code, count });
  }
  return groups.map((group) => {
    const copy = errorCopy(group.code, group.count, label);
    return { code: group.code, count: group.count, cause: copy.cause, fix: copy.fix };
  });
}

function clientRow(client: ClientRecord, decisions: DecisionRecord[], now: Date, seesValue: boolean) {
  const decision = latestDecision(decisions, client.id);
  const ready = stagesReady(client.stages.map((stage) => stage.kind));
  const copy = decisionCardCopy(client.name, ready);
  const undoSeconds = decision?.undoUntil ? Math.ceil((Date.parse(decision.undoUntil) - now.getTime()) / 1000) : null;
  const showDecision = decision && (decision.status === "pending" || (decision.status === "accepted" && undoSeconds != null && undoSeconds > 0));
  return {
    id: client.id,
    name: client.name,
    locationId: client.ghlLocationId,
    metaDatasetId: client.metaDatasetId,
    googleCustomerId: client.googleCustomerId,
    enabled: Boolean(client.enabledAt),
    statusLabel: client.enabledAt ? "On" : undoSeconds != null && undoSeconds > 0 ? "Approved. Waiting out the undo window" : "Off",
    stages: client.stages.map((stage) => ({
      id: stage.id,
      name: stage.ghlStageName,
      kind: stage.kind,
      stageId: stage.ghlStageId,
      metaEventName: stage.metaEventName,
      googleAction: stage.googleAction,
      ...(seesValue && stage.valueCents != null ? { valueCents: stage.valueCents, valueLabel: formatDollars(stage.valueCents, stage.currency) } : {}),
    })),
    decision: showDecision
      ? {
          id: decision.id,
          status: decision.status,
          tag: copy.tag,
          tier: copy.tier,
          clientLabel: client.name,
          expiry: cardExpiryLabel(decision.expiresAt, now),
          headline: copy.headline,
          fix: copy.fix,
          impact: copy.impact,
          confidence: copy.confidence,
          evidence: copy.evidence,
          undoSeconds: undoSeconds != null && undoSeconds > 0 ? undoSeconds : null,
          undoUntil: undoSeconds != null && undoSeconds > 0 ? decision.undoUntil : null,
          canApprove: decision.status === "pending" && Date.parse(decision.expiresAt) > now.getTime() && ready,
          canUndo: decision.status === "accepted" && undoSeconds != null && undoSeconds > 0,
        }
      : null,
  };
}

export function credentialsPresent(env: Env) {
  return { meta: Boolean(metaCredentials(env)), google: Boolean(googleCredentials(env)) };
}

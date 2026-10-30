import type { Prisma } from "@prisma/client";
import type { Env } from "../config";
import { offlineConversionsEnabled } from "../config";
import { prisma } from "../../db";
import { ATTRIBUTION_KEYS, emptyAttribution, type Attribution, type CycleState, type UploadRecord } from "./types";
import { mergeAttribution, parseOpportunity, withFbc, type ParsedOpportunity } from "./click-ids";
import { defaultLogSink, type LogSink } from "./log";
import { planCycle, planIngest } from "./pipeline";
import { executeUploads } from "./send";
import { pullGhlOpportunities } from "./ghl";
import { buildConversionFeedbackView } from "./view";

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

async function timezone() {
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  return org?.timezone || "America/New_York";
}

export async function loadCycleState(now = new Date()): Promise<CycleState> {
  const since = new Date(now.getTime() - 14 * DAY_MS);
  const [clients, decisions, events, recentUploads, sentUploads, issues, alerts] = await Promise.all([
    prisma.conversionClient.findMany({ include: { stages: true }, orderBy: { name: "asc" } }),
    prisma.conversionDecision.findMany(),
    prisma.conversionEvent.findMany({ where: { occurredAt: { gte: since } } }),
    prisma.conversionUpload.findMany({ where: { createdAt: { gte: since } } }),
    prisma.conversionUpload.findMany({ where: { status: "sent" }, orderBy: { sentAt: "desc" }, take: 20 }),
    prisma.conversionIssue.findMany({ where: { occurredAt: { gte: since } } }),
    prisma.conversionAlert.findMany({ where: { firedAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } } }),
  ]);
  const uploads = new Map<string, (typeof recentUploads)[number]>();
  for (const upload of [...recentUploads, ...sentUploads]) uploads.set(upload.id, upload);
  return {
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      ghlLocationId: client.ghlLocationId,
      metaDatasetId: client.metaDatasetId,
      googleCustomerId: client.googleCustomerId,
      enabledAt: iso(client.enabledAt),
      stages: client.stages.map((stage) => ({
        id: stage.id,
        ghlStageId: stage.ghlStageId,
        ghlStageName: stage.ghlStageName,
        kind: stage.kind,
        valueCents: stage.valueCents,
        currency: stage.currency,
        metaEventName: stage.metaEventName,
        googleAction: stage.googleAction,
      })),
    })),
    decisions: decisions.map((decision) => ({
      id: decision.id,
      clientId: decision.clientId,
      status: decision.status,
      expiresAt: decision.expiresAt.toISOString(),
      decidedById: decision.decidedById,
      decidedAt: iso(decision.decidedAt),
      undoUntil: iso(decision.undoUntil),
      createdAt: decision.createdAt.toISOString(),
    })),
    events: events.map((event) => ({
      id: event.id,
      clientId: event.clientId,
      contactId: event.contactId,
      source: event.source,
      externalId: event.externalId,
      kind: event.kind,
      stageName: event.stageName,
      valueCents: event.valueCents,
      currency: event.currency,
      fbclid: event.fbclid,
      fbc: event.fbc,
      fbp: event.fbp,
      gclid: event.gclid,
      gbraid: event.gbraid,
      wbraid: event.wbraid,
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      utmTerm: event.utmTerm,
      utmContent: event.utmContent,
      emailHashMeta: event.emailHashMeta,
      emailHashGoogle: event.emailHashGoogle,
      phoneHashMeta: event.phoneHashMeta,
      phoneHashGoogle: event.phoneHashGoogle,
      occurredAt: event.occurredAt.toISOString(),
    })),
    uploads: [...uploads.values()].map((upload) => ({
      id: upload.id,
      eventId: upload.eventId,
      platform: upload.platform,
      status: upload.status,
      payload: upload.payload,
      attempts: upload.attempts,
      errorCode: upload.errorCode,
      errorMessage: upload.errorMessage,
      createdAt: upload.createdAt.toISOString(),
      sentAt: iso(upload.sentAt),
    })),
    issues: issues.map((issue) => ({
      id: issue.id,
      clientId: issue.clientId,
      code: issue.code,
      platform: issue.platform,
      occurredAt: issue.occurredAt.toISOString(),
    })),
    alerts: alerts.map((alert) => ({
      id: alert.id,
      clientId: alert.clientId,
      platform: alert.platform,
      severity: alert.severity,
      code: alert.code,
      dedupeKey: alert.dedupeKey,
      title: alert.title,
      summary: alert.summary,
      firedAt: alert.firedAt.toISOString(),
      resolvedAt: iso(alert.resolvedAt),
      mutedUntil: iso(alert.mutedUntil),
    })),
  };
}

async function savePlan(plan: ReturnType<typeof planCycle>, now: Date) {
  for (const decision of plan.decisions) {
    await prisma.conversionDecision.update({
      where: { id: decision.id },
      data: {
        status: decision.status,
        decidedById: decision.decidedById,
        decidedAt: decision.decidedAt ? new Date(decision.decidedAt) : null,
        undoUntil: decision.undoUntil ? new Date(decision.undoUntil) : null,
      },
    });
  }
  for (const row of plan.enabled) {
    await prisma.conversionClient.update({
      where: { id: row.clientId },
      data: { enabledAt: new Date(row.enabledAt) },
    });
  }
  for (const id of plan.resolveAlertIds) {
    await prisma.conversionAlert.update({ where: { id }, data: { resolvedAt: now } });
  }
  if (plan.alerts.length) {
    await prisma.conversionAlert.createMany({
      data: plan.alerts.map((alert) => ({
        id: alert.id,
        clientId: alert.clientId,
        platform: alert.platform,
        severity: alert.severity,
        code: alert.code,
        dedupeKey: alert.dedupeKey,
        title: alert.title,
        summary: alert.summary,
        firedAt: new Date(alert.firedAt),
      })),
    });
  }
}

function uploadData(upload: UploadRecord): Prisma.ConversionUploadCreateInput {
  return {
    id: upload.id,
    event: { connect: { id: upload.eventId } },
    platform: upload.platform,
    status: upload.status,
    payload: upload.payload as Prisma.InputJsonValue,
    response: upload.status === "dry_run" ? undefined : { errorCode: upload.errorCode, errorMessage: upload.errorMessage },
    attempts: upload.attempts,
    errorCode: upload.errorCode,
    errorMessage: upload.errorMessage,
    createdAt: new Date(upload.createdAt),
    sentAt: upload.sentAt ? new Date(upload.sentAt) : null,
  };
}

export async function saveContactAttribution(contactId: string, attribution: Attribution) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;
  const current = emptyAttribution();
  for (const key of ATTRIBUTION_KEYS) current[key] = contact[key] || "";
  const merged = mergeAttribution(current, withFbc(attribution, Date.now()));
  const data: Partial<Attribution> = {};
  for (const key of ATTRIBUTION_KEYS) {
    if (merged[key] && merged[key] !== contact[key]) data[key] = merged[key];
  }
  if (Object.keys(data).length) await prisma.contact.update({ where: { id: contactId }, data });
}

export async function recordConversionOpportunity(input: {
  opportunity: ParsedOpportunity;
  contactId: string | null;
  email: string;
  phone: string;
  env?: Env;
  now?: Date;
}) {
  const env = input.env ?? process.env;
  if (!offlineConversionsEnabled(env)) return { status: "flag_off" as const };
  const now = input.now ?? new Date();
  let contactId = input.contactId;
  if (!contactId && input.opportunity.contact.ghlId) {
    const found = await prisma.contact.findFirst({ where: { ghlContactId: input.opportunity.contact.ghlId } });
    contactId = found?.id ?? null;
  }
  if (contactId) await saveContactAttribution(contactId, input.opportunity.attribution);
  const [clients, existing] = await Promise.all([
    prisma.conversionClient.findMany({ include: { stages: true } }),
    prisma.conversionEvent.findMany({
      where: { externalId: input.opportunity.opportunityId },
      select: { clientId: true, externalId: true, kind: true },
    }),
  ]);
  const plan = planIngest({
    opportunity: input.opportunity,
    email: input.email,
    phone: input.phone,
    contactId,
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      ghlLocationId: client.ghlLocationId,
      metaDatasetId: client.metaDatasetId,
      googleCustomerId: client.googleCustomerId,
      enabledAt: iso(client.enabledAt),
      stages: client.stages.map((stage) => ({
        id: stage.id,
        ghlStageId: stage.ghlStageId,
        ghlStageName: stage.ghlStageName,
        kind: stage.kind,
        valueCents: stage.valueCents,
        currency: stage.currency,
        metaEventName: stage.metaEventName,
        googleAction: stage.googleAction,
      })),
    })),
    existingKeys: existing,
    env,
    now,
  });
  if (plan.issue) {
    await prisma.conversionIssue.create({
      data: {
        id: plan.issue.id,
        clientId: plan.issue.clientId,
        code: plan.issue.code,
        platform: plan.issue.platform,
        occurredAt: new Date(plan.issue.occurredAt),
      },
    });
  }
  if (plan.event) {
    const event = plan.event;
    try {
      await prisma.conversionEvent.create({
        data: {
          id: event.id,
          clientId: event.clientId,
          contactId: event.contactId,
          source: event.source,
          externalId: event.externalId,
          kind: event.kind,
          stageName: event.stageName,
          valueCents: event.valueCents,
          currency: event.currency,
          fbclid: event.fbclid,
          fbc: event.fbc,
          fbp: event.fbp,
          gclid: event.gclid,
          gbraid: event.gbraid,
          wbraid: event.wbraid,
          utmSource: event.utmSource,
          utmMedium: event.utmMedium,
          utmCampaign: event.utmCampaign,
          utmTerm: event.utmTerm,
          utmContent: event.utmContent,
          emailHashMeta: event.emailHashMeta,
          emailHashGoogle: event.emailHashGoogle,
          phoneHashMeta: event.phoneHashMeta,
          phoneHashGoogle: event.phoneHashGoogle,
          occurredAt: new Date(event.occurredAt),
        },
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
        return { status: "duplicate" as const };
      }
      throw error;
    }
  }
  return { status: plan.status };
}

export async function finalizeStoredDecisions(now = new Date(), env: Env = process.env) {
  if (!offlineConversionsEnabled(env)) return { enabled: 0 };
  const state = await loadCycleState(now);
  const plan = planCycle({ ...state, events: [], uploads: [], issues: [], alerts: [] }, env, now, undefined, await timezone());
  await savePlan(plan, now);
  return { enabled: plan.enabled.length };
}

export async function runStoredOfflineCycle(env: Env = process.env, now = new Date(), fetchImpl: typeof fetch = fetch, log: LogSink = defaultLogSink) {
  if (!offlineConversionsEnabled(env)) return { status: "off" as const, logged: 0, sent: 0 };
  const zone = await timezone();
  await finalizeStoredDecisions(now, env);
  const pulled = await pullGhlOpportunities(env, fetchImpl);
  if (pulled.status != null && pulled.status >= 400) {
    log(JSON.stringify({ event: "ghl_opportunity_poll", ok: false, status: pulled.status }));
  }
  for (const row of pulled.opportunities) {
    const opportunity = parseOpportunity(row, now);
    if (!opportunity) continue;
    await recordConversionOpportunity({
      opportunity,
      contactId: null,
      email: opportunity.contact.email,
      phone: opportunity.contact.phone,
      env,
      now,
    });
  }
  const state = await loadCycleState(now);
  const plan = planCycle(state, env, now, undefined, zone);
  const executed = await executeUploads({ uploads: plan.uploads, env, fetchImpl, log, now });
  for (const upload of executed.uploads) {
    await prisma.conversionUpload.create({ data: uploadData(upload) });
  }
  await savePlan({ ...plan, uploads: [] }, now);
  return { status: "ran" as const, logged: plan.uploads.length, sent: executed.sent };
}

export async function loadConversionFeedback(seesValue: boolean, now = new Date()) {
  const state = await loadCycleState(now);
  return buildConversionFeedbackView({
    state,
    env: process.env,
    now,
    seesValue,
    timeZone: await timezone(),
  });
}

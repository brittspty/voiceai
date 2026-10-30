import type { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { pageAutoPauseEnabled, pageMonitorCanaryUrl, pageMonitorEnabled } from "../config";
import { WORKSPACE_ID } from "../types";
import { gateAlert, monitorStale, nextProbeAt, pauseAlertDraft, confirming, evaluatePage, formSubmitDue, checkedLabel, loadTimeLabel, CLIENT_PAUSED, planResumeFromTracked } from "./policy";
import type { AdRow, IncidentKind, IncidentRow, PriorAlert, TrackedPause } from "./policy";
import type { PageSample, PageStatus, Pixels } from "./probe";
import { emptyPixels, formTargetIssue, probeCanary, probePage, publicUrlIssue } from "./probe";
import { presentLandingScreen, formResultLabel, type LandingScreen } from "./view";
import { adStatusPatch, credentialFor, performWrite, shouldRetryLive, type AdPlatformWrite, type CredentialRow, type WritePlan } from "./writes";

const STATUSES = new Set<PageStatus>(["up", "slow", "down", "form_broken"]);
const INCIDENT_KINDS = new Set<IncidentKind>(["down", "slow", "form_broken", "pixel_missing"]);

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function asPixels(value: unknown): Pixels {
  if (!value || typeof value !== "object") return emptyPixels();
  const record = value as Record<string, unknown>;
  return { meta: record.meta === true, gtag: record.gtag === true, gtm: record.gtm === true };
}

function asStatus(value: string): PageStatus | null {
  return STATUSES.has(value as PageStatus) ? (value as PageStatus) : null;
}

function sampleFrom(row: {
  region: string;
  status: string;
  loadMs: number | null;
  ttfbMs: number | null;
  httpStatus: number | null;
  formPresent: boolean;
  formSubmitOk: boolean | null;
  pixels: unknown;
  detail: string;
  checkedAt: Date;
}): PageSample | null {
  const status = asStatus(row.status);
  if (!status) return null;
  return {
    at: row.checkedAt.toISOString(),
    region: row.region,
    status,
    loadMs: row.loadMs,
    ttfbMs: row.ttfbMs,
    httpStatus: row.httpStatus,
    formPresent: row.formPresent,
    formSubmitOk: row.formSubmitOk,
    pixels: asPixels(row.pixels),
    detail: row.detail,
  };
}

function credentialRow(row: {
  clientKey: string;
  platform: string;
  secretRef: string;
  appSecretRef: string;
  extraSecretRef: string;
  accountExternalId: string;
  loginCustomerId: string;
  scopes: string[];
}): CredentialRow | null {
  if (row.platform !== "meta" && row.platform !== "google_ads") return null;
  return {
    clientKey: row.clientKey,
    platform: row.platform,
    secretRef: row.secretRef,
    appSecretRef: row.appSecretRef,
    extraSecretRef: row.extraSecretRef,
    accountExternalId: row.accountExternalId,
    loginCustomerId: row.loginCustomerId,
    scopes: row.scopes,
  };
}

async function writeAudit(input: {
  pageId: string | null;
  adId: string | null;
  platform: AdPlatformWrite;
  externalId: string;
  adName: string;
  action: "pause" | "resume";
  fromStatus: string;
  toStatus: string;
  mode: string;
  note: string;
  actorType?: string;
  actorId?: string | null;
  actorName?: string;
}) {
  await prisma.adPauseAudit.create({
    data: {
      workspaceId: WORKSPACE_ID,
      landingPageId: input.pageId,
      adId: input.adId,
      platform: input.platform,
      externalId: input.externalId,
      adName: input.adName,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      mode: input.mode,
      actorType: input.actorType ?? "system",
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? "Page monitor",
      note: input.note.slice(0, 500),
    },
  });
}

async function markPaused(plan: WritePlan, mode: "live" | "dry_run", now: Date) {
  const data = {
    mode,
    pausedAt: now,
    resumedAt: null,
    clientKey: plan.clientKey,
    pageUrl: plan.pageUrl,
    pageName: plan.pageName,
    accountExternalId: plan.accountExternalId,
    externalId: plan.externalId,
    adGroupExternalId: plan.adGroupExternalId,
    customerId: plan.customerId,
    adName: plan.adName,
  };
  if (plan.trackedId) {
    await prisma.systemPausedAd.update({ where: { id: plan.trackedId }, data });
  } else {
    await prisma.systemPausedAd.create({
      data: {
        ...data,
        workspaceId: WORKSPACE_ID,
        adId: plan.adId || null,
        landingPageId: plan.landingPageId || null,
        platform: plan.platform,
      },
    });
  }
  if (mode === "live" && plan.adId) {
    await prisma.ad.updateMany({ where: { id: plan.adId }, data: adStatusPatch("paused", plan.platform) });
  }
}

async function markResumed(plan: WritePlan, now: Date) {
  if (plan.trackedId) {
    await prisma.systemPausedAd.update({ where: { id: plan.trackedId }, data: { resumedAt: now } });
  }
  if (plan.adId) {
    await prisma.ad.updateMany({ where: { id: plan.adId }, data: adStatusPatch("active", plan.platform) });
  }
}

export async function runPageMonitor(env: Record<string, string | undefined> = process.env, deps: { fetchImpl?: FetchLike; now?: Date } = {}) {
  if (!pageMonitorEnabled(env)) return { status: "skipped" as const, reason: "MARKETING_PAGE_MONITOR is off" };
  const canaryUrl = pageMonitorCanaryUrl(env);
  const canaryOk = await probeCanary(canaryUrl, deps.fetchImpl ?? fetch);
  if (!canaryOk) {
    console.log("[page-monitor] canary failed, skipped page checks");
    return { status: "ran" as const, probes: 0, pauses: 0, resumes: 0, canary: "failed" as const };
  }
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const autoPauseOn = pageAutoPauseEnabled(env);
  const [pages, settings, credentialRows, adRows, org] = await Promise.all([
    prisma.landingPage.findMany({
      where: { workspaceId: WORKSPACE_ID, active: true },
      include: {
        checks: { where: { checkedAt: { gte: since } }, orderBy: { checkedAt: "desc" }, take: 2000 },
        incidents: true,
        alerts: { where: { firedAt: { gte: since } }, orderBy: { firedAt: "desc" }, take: 100 },
        pauses: { where: { resumedAt: null } },
        audits: { orderBy: { createdAt: "desc" }, take: 40 },
      },
    }),
    prisma.clientPageSetting.findMany({ where: { workspaceId: WORKSPACE_ID } }),
    prisma.pageWriteCredential.findMany({ where: { workspaceId: WORKSPACE_ID } }),
    prisma.ad.findMany({
      where: { workspaceId: WORKSPACE_ID },
      select: {
        id: true,
        name: true,
        platform: true,
        externalId: true,
        status: true,
        destinationUrl: true,
        adGroup: { select: { externalId: true, campaign: { select: { adAccount: { select: { externalId: true, clientId: true } } } } } },
      },
    }),
    prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } }),
  ]);
  const credentials = credentialRows.map(credentialRow).filter((row): row is CredentialRow => Boolean(row));
  const ads: AdRow[] = adRows.map((ad) => ({
    id: ad.id,
    name: ad.name,
    platform: ad.platform,
    externalId: ad.externalId,
    adGroupExternalId: ad.adGroup.externalId,
    customerId: ad.platform === "google_ads" ? ad.adGroup.campaign.adAccount.externalId.replace(/-/g, "") : "",
    accountExternalId: ad.adGroup.campaign.adAccount.externalId,
    clientKey: ad.adGroup.campaign.adAccount.clientId || "",
    status: ad.status,
    destinationUrl: ad.destinationUrl,
  }));
  let probes = 0;
  let pauses = 0;
  let resumes = 0;
  const logs: string[] = [];
  for (const page of pages) {
    try {
      const outcome = await runOnePage({ page, ads, settings, credentials, autoPauseOn, env, now, orgTimezone: org?.timezone || "America/New_York", fetchImpl: deps.fetchImpl });
      probes += outcome.probes;
      pauses += outcome.pauses;
      resumes += outcome.resumes;
      logs.push(...outcome.logs);
    } catch (error) {
      console.error(`[page-monitor] ${page.name} failed`, error instanceof Error ? error.message : "check failed");
    }
  }
  for (const line of logs) console.log(`[page-monitor] ${line}`);
  return { status: "ran" as const, probes, pauses, resumes };
}

type LoadedPage = Prisma.LandingPageGetPayload<{
  include: { checks: true; incidents: true; alerts: true; pauses: true; audits: true };
}>;

async function runOnePage(input: {
  page: LoadedPage;
  ads: AdRow[];
  settings: { clientKey: string; autoPauseOptIn: boolean; clientAlertOptIn: boolean; timezone: string }[];
  credentials: CredentialRow[];
  autoPauseOn: boolean;
  env: Record<string, string | undefined>;
  now: Date;
  orgTimezone: string;
  fetchImpl?: FetchLike;
}) {
  const { page, now, env } = input;
  const setting = input.settings.find((row) => row.clientKey === page.clientKey) ?? null;
  const timeZone = setting?.timezone || input.orgTimezone;
  const samples = page.checks.map(sampleFrom).filter((sample): sample is PageSample => Boolean(sample)).reverse();
  const incidents: IncidentRow[] = page.incidents
    .filter((incident) => INCIDENT_KINDS.has(incident.kind as IncidentKind))
    .map((incident) => ({
      id: incident.id,
      kind: incident.kind as IncidentKind,
      status: incident.status === "resolved" ? "resolved" : "open",
      pauseHeld: incident.pauseHeld,
      openedAt: incident.openedAt.toISOString(),
    }));
  const priorAlerts: PriorAlert[] = page.alerts.map((alert) => ({
    dedupeKey: alert.dedupeKey,
    code: alert.code,
    severity: alert.severity,
    firedAt: alert.firedAt.toISOString(),
    resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
  }));
  const tracked: TrackedPause[] = page.pauses
    .filter((row): row is typeof row & { platform: "meta" | "google_ads" } => row.platform === "meta" || row.platform === "google_ads")
    .map((row) => ({
      id: row.id,
      adId: row.adId || "",
      mode: row.mode === "live" ? "live" : "dry_run",
      resumedAt: row.resumedAt ? row.resumedAt.toISOString() : null,
      platform: row.platform,
      externalId: row.externalId,
      adGroupExternalId: row.adGroupExternalId,
      customerId: row.customerId,
      accountExternalId: row.accountExternalId,
      clientKey: row.clientKey,
      pageUrl: row.pageUrl,
      pageName: row.pageName,
      pausedAt: row.pausedAt.toISOString(),
      adName: row.adName,
    }));
  const writeMode = {
    meta: credentialFor(page.clientKey, "meta", input.credentials, env).mode,
    google_ads: credentialFor(page.clientKey, "google_ads", input.credentials, env).mode,
  } as const;
  let probes = 0;
  const latest = page.checks[0] ?? null;
  const due = nextProbeAt(latest?.checkedAt.toISOString() ?? null, confirming(samples, incidents), now.getTime()) <= now.getTime();
  let nextSamples = samples;
  if (due && !publicUrlIssue(page.url)) {
    const region = "worker";
    const lastSubmit = page.checks.find((check) => check.formSubmitOk !== null);
    const submit = Boolean(page.formTestUrl) && !formTargetIssue(page.url, page.formTestUrl) && formSubmitDue(lastSubmit?.checkedAt.toISOString() ?? null, now.getTime());
    const sample = await probePage({
      url: page.url,
      region,
      expectForm: page.expectForm,
      formTestUrl: page.formTestUrl,
      submitForm: submit,
      fetchImpl: input.fetchImpl,
      now,
    });
    await prisma.pageCheck.create({
      data: {
        landingPageId: page.id,
        region: sample.region,
        status: sample.status,
        httpStatus: sample.httpStatus,
        ttfbMs: sample.ttfbMs,
        loadMs: sample.loadMs,
        formPresent: sample.formPresent,
        formSubmitOk: sample.formSubmitOk,
        pixels: sample.pixels,
        detail: sample.detail,
        checkedAt: now,
      },
    });
    nextSamples = [...samples, sample];
    probes += 1;
  }
  const lastPush = page.alerts.find((alert) => {
    const channels = alert.channels && typeof alert.channels === "object" ? (alert.channels as { push?: boolean }) : {};
    return channels.push === true;
  });
  const evaluation = evaluatePage({
    now,
    timeZone,
    page: { id: page.id, clientKey: page.clientKey, name: page.name, url: page.url },
    samples: nextSamples,
    incidents,
    alerts: priorAlerts,
    ads: input.ads,
    tracked,
    autoPauseOn: input.autoPauseOn,
    optIn: Boolean(setting?.autoPauseOptIn),
    clientAlertOptIn: Boolean(setting?.clientAlertOptIn),
    mutedUntil: page.mutedUntil ? page.mutedUntil.toISOString() : null,
    lastPushAt: lastPush ? lastPush.firedAt.toISOString() : null,
    canaryOk: true,
    writeMode,
  });
  for (const opening of evaluation.openIncidents) {
    const exists = incidents.some((incident) => incident.status === "open" && incident.kind === opening.kind);
    if (exists) continue;
    await prisma.pageIncident.create({
      data: { landingPageId: page.id, kind: opening.kind, status: "open", summary: opening.summary, openedAt: now },
    });
  }
  for (const closing of evaluation.resolveIncidents) {
    await prisma.pageIncident.updateMany({
      where: { landingPageId: page.id, kind: closing.kind, status: "open" },
      data: { status: "resolved", resolvedAt: now, summary: "Resolved" },
    });
  }
  const logs: string[] = [];
  let pauses = 0;
  let resumes = 0;
  const pausedNames: { name: string; mode: "live" | "dry_run" }[] = [];
  const resumedNames: string[] = [];
  for (const plan of evaluation.plans) {
    const newest = page.audits.find((audit) => audit.adId === plan.adId);
    const failed = newest && (newest.mode === "blocked" || (newest.mode === "live" && newest.note));
    if (failed && !shouldRetryLive(newest.createdAt.toISOString(), now.getTime())) continue;
    const access = credentialFor(page.clientKey, plan.platform, input.credentials, env);
    const outcome = await performWrite({ plan, access, pageName: page.name, env, fetchImpl: input.fetchImpl });
    const note = outcome.ok ? (outcome.mode === "dry_run" ? outcome.log : "") : outcome.reason;
    await writeAudit({
      pageId: page.id,
      adId: plan.adId,
      platform: plan.platform,
      externalId: plan.externalId,
      adName: plan.adName,
      action: plan.to === "PAUSED" ? "pause" : "resume",
      fromStatus: plan.from,
      toStatus: plan.to,
      mode: outcome.ok ? outcome.mode : "blocked",
      note,
    });
    if (!outcome.ok) continue;
    if (outcome.mode === "dry_run") logs.push(outcome.log);
    if (plan.to === "PAUSED") {
      await markPaused(plan, outcome.mode === "live" ? "live" : "dry_run", now);
      pausedNames.push({ name: plan.adName, mode: outcome.mode === "live" ? "live" : "dry_run" });
      if (outcome.mode === "live") pauses += 1;
    } else if (outcome.mode === "live") {
      await markResumed(plan, now);
      resumedNames.push(plan.adName);
      resumes += 1;
    }
  }
  for (const clear of evaluation.clears) {
    await prisma.systemPausedAd.update({ where: { id: clear.trackedId }, data: { resumedAt: now } });
    await writeAudit({
      pageId: page.id,
      adId: clear.adId,
      platform: clear.platform,
      externalId: clear.externalId,
      adName: clear.adName,
      action: "resume",
      fromStatus: "PAUSED",
      toStatus: "ACTIVE",
      mode: "dry_run",
      note: "Dry run cleared. No ad status change was sent.",
    });
    logs.push(`dry run: would resume 1 ad for ${page.name} (${clear.adName})`);
  }
  const livePaused = pausedNames.filter((row) => row.mode === "live").map((row) => row.name);
  const dryPaused = pausedNames.filter((row) => row.mode === "dry_run").map((row) => row.name);
  const pauseDraft = pauseAlertDraft({
    clientKey: page.clientKey,
    pageId: page.id,
    pageName: page.name,
    mode: livePaused.length ? "live" : "dry_run",
    adNames: livePaused.length ? livePaused : dryPaused,
  });
  const drafts = [...evaluation.alerts];
  if (pauseDraft) {
    const gated = gateAlert({
      draft: pauseDraft,
      alerts: priorAlerts,
      now,
      timeZone,
      mutedUntil: page.mutedUntil ? page.mutedUntil.toISOString() : null,
      clientAlertOptIn: Boolean(setting?.clientAlertOptIn),
      lastPushAt: lastPush ? lastPush.firedAt.toISOString() : null,
    });
    if (gated) {
      if (!livePaused.length) gated.clientSummary = gated.clientSummary || "";
      if (livePaused.length) gated.clientSummary = CLIENT_PAUSED;
      drafts.push(gated);
    }
  }
  for (const alert of drafts) {
    let title = alert.title;
    let summary = alert.summary;
    let clientSummary = alert.clientSummary;
    if (alert.code === "page_recovered" && resumedNames.length) {
      title = "Back up, ads resumed";
      summary = resumedNames.join(", ");
      clientSummary = "Your page is back up, and ads are running again.";
    } else if (alert.code === "page_recovered" && evaluation.plans.some((plan) => plan.to === "ACTIVE") && !resumedNames.length) {
      title = "Back up.";
      summary = "The page responded twice. Ads could not be resumed.";
      clientSummary = "Your page is back up.";
    }
    await prisma.pageMonitorAlert.create({
      data: {
        workspaceId: WORKSPACE_ID,
        landingPageId: page.id,
        severity: alert.severity,
        code: alert.code,
        dedupeKey: alert.dedupeKey,
        title,
        summary,
        clientSummary,
        audience: alert.audience,
        channels: alert.channels,
        evidence: alert.evidence,
        firedAt: now,
      },
    });
  }
  if (evaluation.resolveAlertCodes.length) {
    await prisma.pageMonitorAlert.updateMany({
      where: { landingPageId: page.id, code: { in: evaluation.resolveAlertCodes }, resolvedAt: null },
      data: { resolvedAt: now },
    });
  }
  return { probes, pauses, resumes, logs };
}

function trackedFromRow(row: {
  id: string;
  adId: string | null;
  mode: string;
  resumedAt: Date | null;
  platform: "meta" | "google_ads";
  externalId: string;
  adGroupExternalId: string;
  customerId: string;
  accountExternalId: string;
  clientKey: string;
  pageUrl: string;
  pageName: string;
  pausedAt: Date;
  adName: string;
}): TrackedPause {
  return {
    id: row.id,
    adId: row.adId || "",
    mode: row.mode === "live" ? "live" : "dry_run",
    resumedAt: row.resumedAt ? row.resumedAt.toISOString() : null,
    platform: row.platform,
    externalId: row.externalId,
    adGroupExternalId: row.adGroupExternalId,
    customerId: row.customerId,
    accountExternalId: row.accountExternalId,
    clientKey: row.clientKey,
    pageUrl: row.pageUrl,
    pageName: row.pageName,
    pausedAt: row.pausedAt.toISOString(),
    adName: row.adName,
  };
}

export async function resumeLandingAds(input: { pageId?: string; trackedId?: string; actorId: string; actorName: string; env?: Record<string, string | undefined>; fetchImpl?: FetchLike }) {
  const env = input.env ?? process.env;
  const pauses = await prisma.systemPausedAd.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      resumedAt: null,
      mode: "live",
      ...(input.trackedId ? { id: input.trackedId } : { landingPageId: input.pageId || "" }),
    },
  });
  if (!pauses.length) return { ok: false as const, message: "No ads are paused for this page." };
  const credentials = (await prisma.pageWriteCredential.findMany({ where: { workspaceId: WORKSPACE_ID } })).map(credentialRow).filter((row): row is CredentialRow => Boolean(row));
  const now = new Date();
  let resumed = 0;
  const notes: string[] = [];
  for (const row of pauses) {
    if (row.platform !== "meta" && row.platform !== "google_ads") continue;
    const plan = planResumeFromTracked(trackedFromRow({ ...row, platform: row.platform }));
    if (!plan) {
      notes.push("That pause cannot be resumed.");
      continue;
    }
    const access = credentialFor(row.clientKey, row.platform, credentials, env);
    const outcome = await performWrite({ plan, access, pageName: row.pageName || "Landing page", env, fetchImpl: input.fetchImpl });
    await writeAudit({
      pageId: row.landingPageId,
      adId: row.adId,
      platform: row.platform,
      externalId: row.externalId,
      adName: row.adName,
      action: "resume",
      fromStatus: "PAUSED",
      toStatus: "ACTIVE",
      mode: outcome.ok ? outcome.mode : "blocked",
      note: outcome.ok ? (outcome.mode === "dry_run" ? outcome.log : "Resumed by a person.") : outcome.reason,
      actorType: "user",
      actorId: input.actorId,
      actorName: input.actorName,
    });
    if (!outcome.ok) {
      notes.push(outcome.reason);
      continue;
    }
    if (outcome.mode === "dry_run") {
      notes.push("No write access is connected, so nothing changed.");
      continue;
    }
    await markResumed(plan, now);
    resumed += 1;
    if (row.landingPageId) {
      await prisma.pageIncident.updateMany({
        where: { landingPageId: row.landingPageId, kind: "down", status: "open" },
        data: { pauseHeld: true },
      });
    }
  }
  if (!resumed) return { ok: false as const, message: notes[0] || "Nothing changed." };
  return { ok: true as const, message: resumed === 1 ? "Resumed 1 ad." : `Resumed ${resumed} ads.` };
}

export async function loadLandingScreen(input: { audience: "staff" | "client"; canManage: boolean; canEditCredentials: boolean; env?: Record<string, string | undefined>; now?: Date }): Promise<LandingScreen> {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [pages, clients, orphans, accounts, credentialRows, org] = await Promise.all([
    prisma.landingPage.findMany({
      where: { workspaceId: WORKSPACE_ID, active: true },
      orderBy: { name: "asc" },
      include: {
        checks: { where: { checkedAt: { gte: since } }, orderBy: { checkedAt: "desc" }, take: 2000 },
        pauses: { where: { resumedAt: null, mode: "live" } },
        alerts: { orderBy: { firedAt: "desc" }, take: 30 },
        client: { select: { name: true } },
      },
    }),
    prisma.marketingClient.findMany({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: { name: "asc" },
      include: { settings: true },
    }),
    prisma.systemPausedAd.findMany({
      where: { workspaceId: WORKSPACE_ID, resumedAt: null, mode: "live", landingPageId: null },
      orderBy: { pausedAt: "desc" },
    }),
    prisma.adAccount.findMany({
      where: { workspaceId: WORKSPACE_ID },
      orderBy: { name: "asc" },
      select: { id: true, name: true, client: { select: { name: true } } },
    }),
    prisma.pageWriteCredential.findMany({ where: { workspaceId: WORKSPACE_ID } }),
    prisma.org.findUnique({ where: { id: "org" }, select: { timezone: true } }),
  ]);
  const credentials = credentialRows.map(credentialRow).filter((row): row is CredentialRow => Boolean(row));
  const timeZoneFor = (clientKey: string) => clients.find((client) => client.id === clientKey)?.settings[0]?.timezone || org?.timezone || "America/New_York";
  const monitorOn = pageMonitorEnabled(env);
  const rawPages = pages.map((page) => {
    const latest = page.checks[0] ?? null;
    const status: PageStatus | "unchecked" = (latest && asStatus(latest.status)) || "unchecked";
    const submit = page.checks.find((check) => check.formSubmitOk !== null);
    const resumed = page.alerts.find((alert) => alert.code === "page_recovered" && now.getTime() - alert.firedAt.getTime() < 24 * 60 * 60 * 1000);
    return {
      id: page.id,
      name: page.name,
      url: page.url,
      status,
      checkedLabel: checkedLabel(latest?.checkedAt.toISOString() ?? null, now),
      loadLabel: loadTimeLabel(latest?.loadMs ?? null),
      formLabel: formResultLabel({
        formSubmitOk: submit?.formSubmitOk ?? null,
        formPresent: latest?.formPresent ?? false,
        submittedAt: submit?.checkedAt.toISOString() ?? null,
        timeZone: timeZoneFor(page.clientKey),
        expectForm: page.expectForm,
      }),
      pixels: latest ? asPixels(latest.pixels) : null,
      detail: input.audience === "staff" ? latest?.detail || "" : "",
      samples: page.checks.map((check) => ({ at: check.checkedAt.toISOString(), status: check.status })),
      pausedAdNames: page.pauses.map((row) => row.adName || "Ad"),
      recentlyResumed: Boolean(resumed) && page.pauses.length === 0,
      clientName: page.client.name,
    };
  });
  const notices = pages.flatMap((page) =>
    page.alerts.map((alert) => {
      const evidence = alert.evidence && typeof alert.evidence === "object" && "ads" in (alert.evidence as object) ? (alert.evidence as { ads?: { name?: string }[] }) : {};
      const ads = Array.isArray(evidence.ads) ? evidence.ads.filter((ad) => ad && typeof ad.name === "string").map((ad) => ({ name: ad.name as string })) : [];
      return {
        id: alert.id,
        pageId: page.id,
        pageName: page.name,
        code: alert.code,
        title: alert.title,
        summary: alert.summary,
        severity: alert.severity,
        ads,
        resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
        firedAt: alert.firedAt.toISOString(),
      };
    }),
  );
  return presentLandingScreen({
    audience: input.audience,
    now,
    monitorOn,
    autoPauseOn: pageAutoPauseEnabled(env),
    canManage: input.canManage,
    canEditCredentials: input.canEditCredentials,
    stale: monitorStale({
      now: now.getTime(),
      monitorOn,
      pages: pages.map((page) => ({ createdAt: page.createdAt.toISOString(), latestAt: page.checks[0]?.checkedAt.toISOString() ?? null })),
    }),
    optIn: false,
    clientAlertOptIn: false,
    credentials: { meta: false, google: false },
    pages: rawPages,
    notices,
    livePausedPageIds: pages.filter((page) => page.pauses.length > 0).map((page) => page.id),
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      autoPauseOptIn: Boolean(client.settings[0]?.autoPauseOptIn),
      clientAlertOptIn: Boolean(client.settings[0]?.clientAlertOptIn),
      meta: credentialFor(client.id, "meta", credentials, env).mode === "live" ? ("Connected" as const) : ("Not connected" as const),
      google: credentialFor(client.id, "google_ads", credentials, env).mode === "live" ? ("Connected" as const) : ("Not connected" as const),
    })),
    orphans: orphans.map((row) => ({ id: row.id, adName: row.adName || "Ad", pageName: row.pageName || "Deleted page" })),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name, clientName: account.client?.name || "" })),
  });
}

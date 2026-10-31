import { zonedParts } from "../../time";
import type { PageSample, PageStatus, Pixels } from "./probe";
import { destinationMatches } from "./probe";
import type { AdPlatformWrite, WritePlan } from "./writes";

export const CONFIRM_GAP_MIN_MS = 45_000;
export const CONFIRM_GAP_MAX_MS = 120_000;
export const HEALTHY_INTERVAL_MS = 60 * 1000;
export const CONFIRM_INTERVAL_MS = 60 * 1000;
export const SLOW_WINDOW_MS = 30 * 60 * 1000;
export const FORM_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
export const PUSH_GAP_MS = 15 * 60 * 1000;
export const MUTE_MS = 24 * 60 * 60 * 1000;
export const STALE_CHECK_MS = 20 * 60 * 1000;
export const PAUSE_AFTER_FAILURES = 3;
export const RESUME_AFTER_SUCCESSES = 2;
export const ALERT_AFTER_FAILURES = 3;

export const RESUMED_HEADLINE = "Back up, ads resumed";
export const CLIENT_PAUSED = "Ads paused while your page was down";

export type IncidentKind = "down" | "slow" | "form_broken" | "pixel_missing";

export type IncidentRow = {
  id: string;
  kind: IncidentKind;
  status: "open" | "resolved";
  pauseHeld: boolean;
  openedAt: string;
};

export type PriorAlert = {
  dedupeKey: string;
  code: string;
  severity: "info" | "warning" | "critical";
  firedAt: string;
  resolvedAt: string | null;
};

export type AdRow = {
  id: string;
  name: string;
  platform: string;
  externalId: string;
  adGroupExternalId: string;
  customerId: string;
  accountExternalId: string;
  clientKey: string;
  status: string;
  destinationUrl: string;
};

const BLOCKED_CLIENT_KEYS = new Set(["org", "workspace", "client"]);

/** A marketing client id. The workspace id "org" is not a client. */
export function isRealClientKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 64) return false;
  if (BLOCKED_CLIENT_KEYS.has(key.toLowerCase())) return false;
  return /^[a-z0-9_-]+$/i.test(key);
}

export type TrackedPause = {
  id: string;
  adId: string;
  mode: "live" | "dry_run";
  resumedAt: string | null;
  platform: AdPlatformWrite;
  externalId: string;
  adGroupExternalId: string;
  customerId: string;
  accountExternalId: string;
  clientKey: string;
  pageUrl: string;
  pageName: string;
  pausedAt: string;
  adName: string;
};

export type AlertDraft = {
  dedupeKey: string;
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  clientSummary: string;
  audience: "staff" | "both";
  breaksQuietHours: boolean;
  evidence: { ads?: { name: string }[] };
  channels: { inApp: boolean; emailStaff: boolean; emailClient: boolean; push: boolean };
};

export type ClearPause = { trackedId: string; adId: string; adName: string; platform: AdPlatformWrite; externalId: string };

export type Evaluation = {
  displayStatus: PageStatus | "unchecked";
  openIncidents: { kind: IncidentKind; summary: string }[];
  resolveIncidents: { kind: IncidentKind; summary: string }[];
  alerts: AlertDraft[];
  resolveAlertCodes: string[];
  plans: WritePlan[];
  clears: ClearPause[];
};

const RANK = { info: 0, warning: 1, critical: 2 };

export function inQuietHours(now: Date, timeZone: string) {
  const hour = zonedParts(now, timeZone).hour;
  return hour >= 21 || hour < 7;
}

export function pushAllowed(lastPushAt: string | null, now: number) {
  if (!lastPushAt) return true;
  const at = Date.parse(lastPushAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= PUSH_GAP_MS;
}

export function pausedHeadline(count: number) {
  const noun = count === 1 ? "1 ad" : `${count} ads`;
  return `Page down. We paused ${noun} that send people here`;
}

export function wouldPauseHeadline(count: number) {
  const noun = count === 1 ? "1 ad" : `${count} ads`;
  return `Page down. We would pause ${noun} that send people here`;
}

export function clientDownCopy(name: string) {
  return `Your '${name}' page is down. Your account manager has been told.`;
}

export function dedupeKey(clientKey: string, pageId: string, code: string) {
  return `${clientKey}:page_monitor:${pageId}:${code}`;
}

function sorted(samples: PageSample[]) {
  return [...samples].sort((a, b) => a.at.localeCompare(b.at));
}

function suffixWhile(samples: PageSample[], keep: (sample: PageSample) => boolean) {
  const list = sorted(samples);
  const suffix: PageSample[] = [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (!keep(list[index])) break;
    suffix.push(list[index]);
  }
  return suffix.reverse();
}

export function gapsAboutOneMinute(samples: PageSample[]) {
  if (samples.length < 2) return false;
  for (let index = 1; index < samples.length; index += 1) {
    const gap = Date.parse(samples[index].at) - Date.parse(samples[index - 1].at);
    if (gap < CONFIRM_GAP_MIN_MS || gap > CONFIRM_GAP_MAX_MS) return false;
  }
  return true;
}

export function downConfirmed(samples: PageSample[]) {
  const failed = suffixWhile(samples, (sample) => sample.status === "down");
  if (failed.length < ALERT_AFTER_FAILURES) return false;
  return gapsAboutOneMinute(failed.slice(-ALERT_AFTER_FAILURES));
}

export function pauseReady(samples: PageSample[], canaryOk: boolean) {
  if (!canaryOk) return false;
  const failed = suffixWhile(samples, (sample) => sample.status === "down");
  if (failed.length < PAUSE_AFTER_FAILURES) return false;
  return gapsAboutOneMinute(failed.slice(-PAUSE_AFTER_FAILURES));
}

export function recovered(samples: PageSample[]) {
  const good = suffixWhile(samples, (sample) => sample.status === "up" || sample.status === "slow");
  if (good.length < RESUME_AFTER_SUCCESSES) return false;
  return gapsAboutOneMinute(good.slice(-RESUME_AFTER_SUCCESSES));
}

export function formConfirmed(samples: PageSample[]) {
  return suffixWhile(samples, (sample) => sample.status === "form_broken").length >= ALERT_AFTER_FAILURES;
}

export function slowConfirmed(samples: PageSample[]) {
  const slow = suffixWhile(samples, (sample) => sample.status === "slow");
  if (slow.length < 2) return false;
  return Date.parse(slow[slow.length - 1].at) - Date.parse(slow[0].at) >= SLOW_WINDOW_MS;
}

const PIXEL_NAMES = ["meta", "gtag", "gtm"] as const;

export function pixelProblem(samples: PageSample[]): string[] | null {
  const loaded = sorted(samples).filter((sample) => sample.status !== "down");
  const latest = loaded[loaded.length - 1];
  const previous = loaded[loaded.length - 2];
  if (!latest || !previous) return null;
  const lost = PIXEL_NAMES.filter((name) => previous.pixels[name] && !latest.pixels[name]);
  if (lost.length) return [...lost];
  const allMissing = PIXEL_NAMES.every((name) => !latest.pixels[name] && !previous.pixels[name]);
  return allMissing ? [...PIXEL_NAMES] : null;
}

export function confirming(samples: PageSample[], incidents: IncidentRow[]) {
  if (incidents.some((incident) => incident.status === "open" && (incident.kind === "down" || incident.kind === "form_broken"))) return true;
  const latest = sorted(samples).at(-1);
  return latest?.status === "down" || latest?.status === "form_broken";
}

export function nextProbeAt(lastAt: string | null, isConfirming: boolean, now: number) {
  if (!lastAt) return now;
  const last = Date.parse(lastAt);
  if (!Number.isFinite(last)) return now;
  return last + (isConfirming ? CONFIRM_INTERVAL_MS : HEALTHY_INTERVAL_MS);
}

export function formSubmitDue(lastSubmitAt: string | null, now: number) {
  if (!lastSubmitAt) return true;
  const at = Date.parse(lastSubmitAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= FORM_INTERVAL_MS;
}

export function monitorStale(input: { now: number; monitorOn: boolean; pages: { createdAt: string; latestAt: string | null }[] }) {
  if (!input.monitorOn) return false;
  return input.pages.some((page) => {
    const created = Date.parse(page.createdAt);
    if (!Number.isFinite(created) || input.now - created < STALE_CHECK_MS) return false;
    if (!page.latestAt) return true;
    const latest = Date.parse(page.latestAt);
    return !Number.isFinite(latest) || input.now - latest >= STALE_CHECK_MS;
  });
}

function latestAlert(alerts: PriorAlert[], key: string) {
  return alerts
    .filter((alert) => alert.dedupeKey === key)
    .sort((a, b) => a.firedAt.localeCompare(b.firedAt))
    .at(-1) ?? null;
}

export function gateAlert(input: {
  draft: Omit<AlertDraft, "channels">;
  alerts: PriorAlert[];
  now: Date;
  timeZone: string;
  mutedUntil: string | null;
  clientAlertOptIn: boolean;
  lastPushAt: string | null;
}): AlertDraft | null {
  if (input.mutedUntil && Date.parse(input.mutedUntil) > input.now.getTime()) return null;
  const quiet = inQuietHours(input.now, input.timeZone);
  if (quiet && !input.draft.breaksQuietHours && input.draft.severity !== "critical") return null;
  const previous = latestAlert(input.alerts, input.draft.dedupeKey);
  if (previous) {
    const higher = RANK[input.draft.severity] > RANK[previous.severity];
    if (!previous.resolvedAt && !higher) return null;
    if (previous.resolvedAt && !higher) {
      const fired = Date.parse(previous.firedAt);
      if (Number.isFinite(fired) && input.now.getTime() - fired < ALERT_COOLDOWN_MS) return null;
    }
  }
  const staffCritical = input.draft.severity === "critical";
  const clientEmail = staffCritical && input.draft.audience === "both" && input.clientAlertOptIn && (input.draft.code === "page_down" || input.draft.code === "ads_paused");
  return {
    ...input.draft,
    channels: {
      inApp: true,
      emailStaff: staffCritical,
      emailClient: clientEmail,
      push: staffCritical && pushAllowed(input.lastPushAt, input.now.getTime()),
    },
  };
}

function openOf(incidents: IncidentRow[], kind: IncidentKind) {
  return incidents.find((incident) => incident.status === "open" && incident.kind === kind) ?? null;
}

function writablePlatform(platform: string): AdPlatformWrite | null {
  if (platform === "meta" || platform === "google_ads") return platform;
  return null;
}

function matchingAds(page: { clientKey: string; url: string }, ads: AdRow[]) {
  if (!isRealClientKey(page.clientKey)) return [];
  return ads.filter((ad) => ad.clientKey === page.clientKey && writablePlatform(ad.platform) && ad.status === "active" && destinationMatches(ad.destinationUrl, page.url));
}

function planFor(ad: AdRow, page: { id: string; url: string; name?: string }, to: "PAUSED" | "ACTIVE", tracked?: TrackedPause): WritePlan | null {
  const platform = writablePlatform(ad.platform) || tracked?.platform;
  if (!platform) return null;
  const customerId = tracked?.customerId || ad.customerId;
  const adGroupExternalId = tracked?.adGroupExternalId || ad.adGroupExternalId;
  return {
    platform,
    level: "ad",
    operation: "update_status",
    externalId: tracked?.externalId || ad.externalId,
    adGroupExternalId,
    customerId,
    from: to === "PAUSED" ? "ACTIVE" : "PAUSED",
    to,
    pausedBySystem: to === "ACTIVE",
    adId: ad.id,
    adName: ad.name || tracked?.adName || "Ad",
    landingPageId: page.id,
    trackedId: tracked?.id,
    accountExternalId: tracked?.accountExternalId || ad.accountExternalId,
    pageUrl: tracked?.pageUrl || page.url,
    pausedAt: tracked?.pausedAt || "",
    clientKey: tracked?.clientKey || ad.clientKey,
    pageName: tracked?.pageName || page.name || "",
  };
}

/** Resume from the stored pause row. The landing page does not have to exist. */
export function planResumeFromTracked(row: TrackedPause): WritePlan | null {
  if (row.mode !== "live" || row.resumedAt) return null;
  if (!isRealClientKey(row.clientKey)) return null;
  return planFor(
    {
      id: row.adId,
      name: row.adName,
      platform: row.platform,
      externalId: row.externalId,
      adGroupExternalId: row.adGroupExternalId,
      customerId: row.customerId,
      accountExternalId: row.accountExternalId,
      clientKey: row.clientKey,
      status: "paused",
      destinationUrl: row.pageUrl,
    },
    { id: "", url: row.pageUrl },
    "ACTIVE",
    row,
  );
}

export function checkedLabel(at: string | null, now: Date) {
  if (!at) return "Not checked yet";
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60_000));
  if (mins < 1) return "Checked just now";
  if (mins === 1) return "Checked 1 min ago";
  if (mins < 60) return `Checked ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return "Checked 1 hour ago";
  if (hours < 48) return `Checked ${hours} hours ago`;
  const days = Math.round(hours / 24);
  return `Checked ${days} days ago`;
}

export function loadTimeLabel(loadMs: number | null) {
  if (loadMs === null || !Number.isFinite(loadMs)) return null;
  const seconds = (loadMs / 1000).toFixed(1);
  if (loadMs > LOAD_GOAL_MS_SAFE) return `${seconds}s, slow: goal under 2.5s`;
  return `${seconds}s`;
}

const LOAD_GOAL_MS_SAFE = 2500;

export function uptimeReport(samples: { at: string; status: string }[], now: Date) {
  const start = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const window = samples
    .filter((sample) => {
      const at = Date.parse(sample.at);
      return Number.isFinite(at) && at >= start && at <= now.getTime();
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const days = Array.from({ length: 7 }, (_, index) => {
    const dayStart = start + index * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const inDay = window.filter((sample) => {
      const at = Date.parse(sample.at);
      return at >= dayStart && at < dayEnd;
    });
    const down = inDay.filter((sample) => sample.status === "down").length;
    const state = !inDay.length ? "none" : down === 0 ? "up" : down === inDay.length ? "down" : "mixed";
    return { label: new Date(dayStart).toISOString().slice(5, 10), state };
  });
  if (!window.length) return { days, text: "No checks in the last 7 days." };
  let runs = 0;
  let downMs = 0;
  let runStart: number | null = null;
  for (const sample of window) {
    const at = Date.parse(sample.at);
    if (sample.status === "down") {
      if (runStart === null) {
        runs += 1;
        runStart = at;
      }
    } else if (runStart !== null) {
      downMs += at - runStart;
      runStart = null;
    }
  }
  if (runStart !== null) downMs += now.getTime() - runStart;
  if (!runs) return { days, text: "Up all week." };
  const minutes = Math.max(1, Math.round(downMs / 60_000));
  const times = runs === 1 ? "once" : runs === 2 ? "twice" : `${runs} times`;
  return { days, text: `Down ${times}, ${minutes} min total` };
}

export function clientStatusSentence(input: { name: string; status: PageStatus | "unchecked"; adsPaused: boolean; recentlyResumed: boolean }) {
  if (input.adsPaused) return CLIENT_PAUSED;
  if (input.recentlyResumed && (input.status === "up" || input.status === "slow")) return "Your page is back up, and ads are running again.";
  if (input.status === "down") return clientDownCopy(input.name);
  if (input.status === "form_broken") return `The form on your '${input.name}' page needs a look. Your account manager has been told.`;
  if (input.status === "slow") return `Your '${input.name}' page is slow.`;
  if (input.status === "up") return `Your '${input.name}' page is up.`;
  return "This page has not been checked yet.";
}

export function statusLabel(status: PageStatus | "unchecked") {
  if (status === "form_broken") return "Form broken";
  if (status === "unchecked") return "Not checked";
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function pixelLabel(pixels: Pixels | null) {
  if (!pixels) return null;
  const missing: string[] = [];
  if (!pixels.meta) missing.push("Meta Pixel");
  if (!pixels.gtag) missing.push("Google tag");
  if (!pixels.gtm) missing.push("Tag Manager");
  if (!missing.length) return "Meta Pixel, Google tag, and Tag Manager found";
  if (missing.length === 3) return "No Meta Pixel, Google tag, or Tag Manager";
  return `Missing ${missing.join(" and ")}`;
}

export function pixelSummary(pixels: Pixels | null) {
  return pixelLabel(pixels);
}

export function evaluatePage(input: {
  now: Date;
  timeZone: string;
  page: { id: string; clientKey: string; name: string; url: string };
  samples: PageSample[];
  incidents: IncidentRow[];
  alerts: PriorAlert[];
  ads: AdRow[];
  tracked: TrackedPause[];
  autoPauseOn: boolean;
  optIn: boolean;
  clientAlertOptIn: boolean;
  mutedUntil: string | null;
  lastPushAt: string | null;
  canaryOk: boolean;
  writeMode: Record<AdPlatformWrite, "live" | "dry_run">;
}): Evaluation {
  const samples = sorted(input.samples);
  const latest = samples.at(-1);
  const displayStatus = latest?.status ?? "unchecked";
  const openIncidents: Evaluation["openIncidents"] = [];
  const resolveIncidents: Evaluation["resolveIncidents"] = [];
  const ungated: Omit<AlertDraft, "channels">[] = [];
  const resolveAlertCodes: string[] = [];
  const plans: WritePlan[] = [];
  const clears: ClearPause[] = [];
  const downOpen = openOf(input.incidents, "down");
  const pageDown = downConfirmed(samples);
  const pageRecovered = Boolean(downOpen) && recovered(samples);

  if (pageDown && !downOpen) openIncidents.push({ kind: "down", summary: "Down on three checks about a minute apart." });
  if (pageRecovered && downOpen) {
    resolveIncidents.push({ kind: "down", summary: "Resolved" });
    resolveAlertCodes.push("page_down", "ads_paused");
  }

  if (pageDown) {
    ungated.push({
      dedupeKey: dedupeKey(input.page.clientKey, input.page.id, "page_down"),
      code: "page_down",
      severity: "critical",
      title: `${input.page.name} is down`,
      summary: "Three checks failed about a minute apart.",
      clientSummary: clientDownCopy(input.page.name),
      audience: "both",
      breaksQuietHours: true,
      evidence: {},
    });
  }

  const canPause = input.autoPauseOn && input.optIn && isRealClientKey(input.page.clientKey) && pageDown && pauseReady(samples, input.canaryOk) && !(downOpen?.pauseHeld);
  const outstanding = input.tracked.filter((row) => !row.resumedAt);
  if (canPause && !pageRecovered) {
    for (const ad of matchingAds(input.page, input.ads)) {
      const platform = writablePlatform(ad.platform);
      if (!platform) continue;
      const existing = outstanding.find((row) => row.adId === ad.id);
      if (existing?.mode === "live") continue;
      if (existing?.mode === "dry_run" && input.writeMode[platform] === "dry_run") continue;
      const plan = planFor(ad, input.page, "PAUSED", existing);
      if (plan) plans.push(plan);
    }
  }

  if (pageRecovered) {
    const live = outstanding.filter((row) => row.mode === "live");
    const resumable = live.filter((row) => input.writeMode[row.platform] === "live");
    for (const row of live) {
      const ad = input.ads.find((item) => item.id === row.adId);
      const status = ad?.status ?? "paused";
      if (ad && ad.clientKey !== row.clientKey) continue;
      if (status === "archived" || status === "deleted" || status === "active") continue;
      const plan = planFor(
        ad ?? {
          id: row.adId,
          name: row.adName,
          platform: row.platform,
          externalId: row.externalId,
          adGroupExternalId: row.adGroupExternalId,
          customerId: row.customerId,
          status: "paused",
          accountExternalId: row.accountExternalId,
          clientKey: row.clientKey,
          destinationUrl: row.pageUrl || input.page.url,
        },
        { id: input.page.id, url: row.pageUrl || input.page.url },
        "ACTIVE",
        row,
      );
      if (plan) plans.push(plan);
    }
    for (const row of outstanding.filter((item) => item.mode === "dry_run")) {
      clears.push({ trackedId: row.id, adId: row.adId, adName: row.adName, platform: row.platform, externalId: row.externalId });
    }
    ungated.push({
      dedupeKey: dedupeKey(input.page.clientKey, input.page.id, "page_recovered"),
      code: "page_recovered",
      severity: "info",
      title: resumable.length ? RESUMED_HEADLINE : live.length ? `Back up. We would resume ${live.length === 1 ? "1 ad" : `${live.length} ads`}. Nothing changed.` : "Back up.",
      summary: resumable.length ? resumable.map((row) => row.adName).join(", ") : "The page responded twice.",
      clientSummary: resumable.length ? "Your page is back up, and ads are running again." : "Your page is back up.",
      audience: "both",
      breaksQuietHours: true,
      evidence: { ads: resumable.map((row) => ({ name: row.adName })) },
    });
  }

  const slowOpen = openOf(input.incidents, "slow");
  if (slowConfirmed(samples) && !slowOpen && !pageDown) {
    openIncidents.push({ kind: "slow", summary: "Slow for more than 30 minutes." });
  }
  if (slowOpen && latest && latest.status !== "slow") {
    resolveIncidents.push({ kind: "slow", summary: "Resolved" });
    resolveAlertCodes.push("page_slow");
  }
  if (slowConfirmed(samples) && !pageDown) {
    ungated.push({
      dedupeKey: dedupeKey(input.page.clientKey, input.page.id, "page_slow"),
      code: "page_slow",
      severity: "warning",
      title: `${input.page.name} has been slow for 30 minutes`,
      summary: "Load time is over the 2.5s goal.",
      clientSummary: "",
      audience: "staff",
      breaksQuietHours: false,
      evidence: {},
    });
  }

  const formOpen = openOf(input.incidents, "form_broken");
  if (formConfirmed(samples) && !formOpen) openIncidents.push({ kind: "form_broken", summary: "The form check failed three times." });
  if (formOpen && latest && latest.status !== "form_broken") {
    resolveIncidents.push({ kind: "form_broken", summary: "Resolved" });
    resolveAlertCodes.push("form_broken");
  }
  if (formConfirmed(samples)) {
    ungated.push({
      dedupeKey: dedupeKey(input.page.clientKey, input.page.id, "form_broken"),
      code: "form_broken",
      severity: "critical",
      title: `The form on ${input.page.name} is broken`,
      summary: "Three checks could not use the form.",
      clientSummary: "",
      audience: "staff",
      breaksQuietHours: true,
      evidence: {},
    });
  }

  const missingPixels = pixelProblem(samples);
  const pixelOpen = openOf(input.incidents, "pixel_missing");
  if (missingPixels && !pixelOpen) openIncidents.push({ kind: "pixel_missing", summary: `Missing ${missingPixels.join(", ")}.` });
  if (pixelOpen && !missingPixels) {
    resolveIncidents.push({ kind: "pixel_missing", summary: "Resolved" });
    resolveAlertCodes.push("pixel_missing");
  }
  if (missingPixels) {
    ungated.push({
      dedupeKey: dedupeKey(input.page.clientKey, input.page.id, "pixel_missing"),
      code: "pixel_missing",
      severity: "warning",
      title: `${input.page.name} is missing a tracking pixel`,
      summary: `Missing ${missingPixels.join(", ")}.`,
      clientSummary: "",
      audience: "staff",
      breaksQuietHours: false,
      evidence: {},
    });
  }

  const alerts = ungated
    .map((draft) =>
      gateAlert({
        draft,
        alerts: input.alerts,
        now: input.now,
        timeZone: input.timeZone,
        mutedUntil: input.mutedUntil,
        clientAlertOptIn: input.clientAlertOptIn,
        lastPushAt: input.lastPushAt,
      }),
    )
    .filter((alert): alert is AlertDraft => Boolean(alert));

  return { displayStatus, openIncidents, resolveIncidents, alerts, resolveAlertCodes, plans, clears };
}

export function pauseAlertDraft(input: {
  clientKey: string;
  pageId: string;
  pageName: string;
  mode: "live" | "dry_run";
  adNames: string[];
}): Omit<AlertDraft, "channels"> | null {
  if (!input.adNames.length) return null;
  if (input.mode === "dry_run") {
    return {
      dedupeKey: dedupeKey(input.clientKey, input.pageId, "ads_paused"),
      code: "ads_paused",
      severity: "critical",
      title: wouldPauseHeadline(input.adNames.length),
      summary: `No write access is connected, so nothing changed. ${input.adNames.join(", ")}`,
      clientSummary: clientDownCopy(input.pageName),
      audience: "both",
      breaksQuietHours: true,
      evidence: { ads: input.adNames.map((name) => ({ name })) },
    };
  }
  return {
    dedupeKey: dedupeKey(input.clientKey, input.pageId, "ads_paused"),
    code: "ads_paused",
    severity: "critical",
    title: pausedHeadline(input.adNames.length),
    summary: input.adNames.join(", "),
    clientSummary: CLIENT_PAUSED,
    audience: "both",
    breaksQuietHours: true,
    evidence: { ads: input.adNames.map((name) => ({ name })) },
  };
}

export { pixelLabel };

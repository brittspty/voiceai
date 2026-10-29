import type { PageStatus, Pixels } from "./probe";
import { clientStatusSentence, pixelSummary, statusLabel, uptimeReport, type IncidentKind } from "./policy";

export type UptimeDay = { label: string; state: string };

export type StaffPageRow = {
  id: string;
  name: string;
  url: string;
  status: PageStatus | "unchecked";
  statusLabel: string;
  checkedLabel: string;
  summary: string;
  uptime: UptimeDay[];
  uptimeText: string;
  loadLabel: string | null;
  formLabel: string | null;
  pixelLabel: string | null;
  detail: string;
  pausedAds: { name: string }[];
};

export type ClientPageRow = {
  id: string;
  name: string;
  status: PageStatus | "unchecked";
  statusLabel: string;
  checkedLabel: string;
  summary: string;
  uptime: UptimeDay[];
  uptimeText: string;
};

export type PageNotice = {
  id: string;
  pageId: string;
  pageName: string;
  code: string;
  title: string;
  summary: string;
  tone: "critical" | "warning" | "info";
  ads: { name: string }[];
  canResume: boolean;
};

export type LandingScreen = {
  audience: "staff" | "client";
  monitorOn: boolean;
  autoPauseOn: boolean;
  canManage: boolean;
  canEditCredentials: boolean;
  stale: boolean;
  optIn: boolean;
  clientAlertOptIn: boolean;
  credentials: { meta: "Connected" | "Not connected"; google: "Connected" | "Not connected" } | null;
  pages: StaffPageRow[] | ClientPageRow[];
  notices: PageNotice[];
};

type RawPage = {
  id: string;
  name: string;
  url: string;
  status: PageStatus | "unchecked";
  checkedLabel: string;
  loadLabel: string | null;
  formLabel: string | null;
  pixels: Pixels | null;
  detail: string;
  samples: { at: string; status: string }[];
  pausedAdNames: string[];
  recentlyResumed: boolean;
};

type RawNotice = {
  id: string;
  pageId: string;
  pageName: string;
  code: string;
  title: string;
  summary: string;
  severity: "info" | "warning" | "critical";
  ads: { name: string }[];
  resolvedAt: string | null;
  firedAt: string;
};

const CLIENT_KEYS = new Set(["id", "name", "status", "statusLabel", "checkedLabel", "summary", "uptime", "uptimeText"]);

export function formResultLabel(input: {
  formSubmitOk: boolean | null;
  formPresent: boolean;
  submittedAt: string | null;
  timeZone: string;
  expectForm: boolean;
}) {
  if (!input.expectForm) return "No form on this page";
  if (input.formSubmitOk === true && input.submittedAt) {
    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(input.submittedAt));
    return `Test lead sent ${when} ✓`;
  }
  if (input.formSubmitOk === false) return "Test lead did not send";
  if (input.formPresent) return "Form is on the page. Test lead has not been sent.";
  return "Form not found";
}

function noticeTone(severity: RawNotice["severity"]): PageNotice["tone"] {
  return severity;
}

function staffNotices(notices: RawNotice[], pausedIds: Set<string>, now: number): PageNotice[] {
  const visible = notices.filter((notice) => {
    if (!notice.resolvedAt) return true;
    if (notice.code !== "page_recovered") return false;
    const fired = Date.parse(notice.firedAt);
    return Number.isFinite(fired) && now - fired < 24 * 60 * 60 * 1000;
  });
  const byPage = new Map<string, RawNotice[]>();
  for (const notice of visible) {
    const list = byPage.get(notice.pageId) ?? [];
    list.push(notice);
    byPage.set(notice.pageId, list);
  }
  const chosen: RawNotice[] = [];
  for (const list of byPage.values()) {
    const paused = list.find((notice) => !notice.resolvedAt && notice.code === "ads_paused");
    const down = list.find((notice) => !notice.resolvedAt && notice.code === "page_down");
    const recovered = list.find((notice) => notice.code === "page_recovered");
    if (paused) chosen.push(paused);
    else if (down) chosen.push(down);
    else if (recovered && !list.some((notice) => !notice.resolvedAt && (notice.code === "page_down" || notice.code === "ads_paused"))) chosen.push(recovered);
    for (const notice of list) {
      if (notice.code === "form_broken" || notice.code === "page_slow" || notice.code === "pixel_missing") {
        if (!notice.resolvedAt) chosen.push(notice);
      }
    }
  }
  return chosen.map((notice) => ({
    id: notice.id,
    pageId: notice.pageId,
    pageName: notice.pageName,
    code: notice.code,
    title: notice.title,
    summary: notice.summary,
    tone: noticeTone(notice.severity),
    ads: notice.code === "ads_paused" || notice.code === "page_recovered" ? notice.ads : [],
    canResume: notice.code === "ads_paused" && pausedIds.has(notice.pageId) && !notice.title.startsWith("Page down. We would pause"),
  }));
}

export function presentLandingScreen(input: {
  audience: "staff" | "client";
  now: Date;
  monitorOn: boolean;
  autoPauseOn: boolean;
  canManage: boolean;
  canEditCredentials: boolean;
  stale: boolean;
  optIn: boolean;
  clientAlertOptIn: boolean;
  credentials: { meta: boolean; google: boolean };
  pages: RawPage[];
  notices: RawNotice[];
  livePausedPageIds: string[];
}): LandingScreen {
  const uptimeFor = (page: RawPage) => uptimeReport(page.samples, input.now);
  if (input.audience === "client") {
    const pages: ClientPageRow[] = input.pages.map((page) => {
      const uptime = uptimeFor(page);
      const row: ClientPageRow = {
        id: page.id,
        name: page.name,
        status: page.status,
        statusLabel: statusLabel(page.status),
        checkedLabel: page.checkedLabel,
        summary: clientStatusSentence({
          name: page.name,
          status: page.status,
          adsPaused: page.pausedAdNames.length > 0,
          recentlyResumed: page.recentlyResumed,
        }),
        uptime: uptime.days,
        uptimeText: uptime.text,
      };
      return row;
    });
    return {
      audience: "client",
      monitorOn: input.monitorOn,
      autoPauseOn: false,
      canManage: false,
      canEditCredentials: false,
      stale: input.stale,
      optIn: false,
      clientAlertOptIn: false,
      credentials: null,
      pages,
      notices: [],
    };
  }
  const pausedIds = new Set(input.livePausedPageIds);
  const pages: StaffPageRow[] = input.pages.map((page) => {
    const uptime = uptimeFor(page);
    return {
      id: page.id,
      name: page.name,
      url: page.url,
      status: page.status,
      statusLabel: statusLabel(page.status),
      checkedLabel: page.checkedLabel,
      summary: uptime.text,
      uptime: uptime.days,
      uptimeText: uptime.text,
      loadLabel: page.loadLabel,
      formLabel: page.formLabel,
      pixelLabel: pixelSummary(page.pixels),
      detail: page.detail,
      pausedAds: page.pausedAdNames.map((name) => ({ name })),
    };
  });
  return {
    audience: "staff",
    monitorOn: input.monitorOn,
    autoPauseOn: input.autoPauseOn,
    canManage: input.canManage,
    canEditCredentials: input.canEditCredentials,
    stale: input.stale,
    optIn: input.optIn,
    clientAlertOptIn: input.clientAlertOptIn,
    credentials: {
      meta: input.credentials.meta ? "Connected" : "Not connected",
      google: input.credentials.google ? "Connected" : "Not connected",
    },
    pages,
    notices: staffNotices(input.notices, pausedIds, input.now.getTime()),
  };
}

export function clientPageKeys(row: ClientPageRow) {
  return Object.keys(row);
}

export function isClientPageRow(row: StaffPageRow | ClientPageRow): row is ClientPageRow {
  return clientPageKeys(row as ClientPageRow).every((key) => CLIENT_KEYS.has(key)) && !("url" in row) && !("pausedAds" in row);
}

export type { IncidentKind };

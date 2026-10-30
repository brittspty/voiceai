export type Pixels = { meta: boolean; gtag: boolean; gtm: boolean };

export type PageStatus = "up" | "slow" | "down" | "form_broken";

export type PageSample = {
  at: string;
  region: string;
  status: PageStatus;
  loadMs: number | null;
  ttfbMs: number | null;
  httpStatus: number | null;
  formPresent: boolean;
  formSubmitOk: boolean | null;
  pixels: Pixels;
  detail: string;
};

export const LOAD_GOAL_MS = 2500;
export const TEST_LEAD_FIELD = "voiceops_test_lead";
export const TEST_LEAD_EMAIL = "page-check@invalid.example";
export const TEST_LEAD_HEADER = "x-voiceops-test-lead";

const PRIVATE_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.google.internal."]);

export function emptyPixels(): Pixels {
  return { meta: false, gtag: false, gtm: false };
}

export function analyzeHtml(html: string): { formPresent: boolean; pixels: Pixels } {
  const text = html.slice(0, 1_000_000);
  const formPresent = /<form\b/i.test(text);
  const meta = /fbq\s*\(|connect\.facebook\.net\/[^"'<\s]+\/fbevents\.js|facebook\.com\/tr\?/i.test(text);
  const gtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/.test(text);
  const gtag = /googletagmanager\.com\/gtag\/js|gtag\s*\(/.test(text);
  return { formPresent, pixels: { meta, gtag, gtm } };
}

export function classifySample(input: {
  httpOk: boolean;
  timedOut: boolean;
  loadMs: number | null;
  formPresent: boolean;
  formSubmitOk: boolean | null;
  expectForm: boolean;
}): PageStatus {
  if (!input.httpOk || input.timedOut) return "down";
  const formBroken = input.expectForm && (!input.formPresent || input.formSubmitOk === false);
  if (formBroken) return "form_broken";
  if (input.loadMs !== null && input.loadMs > LOAD_GOAL_MS) return "slow";
  return "up";
}

function ipv4Blocked(host: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function ipv6Blocked(host: string) {
  const value = host.toLowerCase();
  if (value === "::1" || value === "[::1]") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  return false;
}

/** https pages on a public host. Blocks loopback, link-local, and private networks. */
export function publicUrlIssue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "Enter a page address.";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Enter a full page address, starting with https://.";
  }
  if (url.username || url.password) return "The address cannot include a username or password.";
  if (url.protocol !== "https:") return "Use an https:// address.";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || PRIVATE_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return "That address is not a public page.";
  }
  if (ipv4Blocked(host) || ipv6Blocked(host)) return "That address is not a public page.";
  return null;
}

export function canonicalPageUrl(raw: string) {
  if (publicUrlIssue(raw)) return null;
  const url = new URL(raw.trim());
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function sitePath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return { host, path };
  } catch {
    return null;
  }
}

/** Same site and path. Ignores www, query, and hash. */
export function destinationMatches(destination: string, pageUrl: string) {
  const left = sitePath(destination);
  const right = sitePath(pageUrl);
  if (!left || !right) return false;
  return left.host === right.host && left.path === right.path;
}

export function formTargetIssue(pageUrl: string, formTestUrl: string, extraHosts: string[] = []) {
  const trimmed = formTestUrl.trim();
  if (!trimmed) return null;
  const issue = publicUrlIssue(trimmed);
  if (issue) return issue;
  const page = sitePath(pageUrl);
  const form = sitePath(trimmed);
  if (!page || !form) return "Enter a test form address on this page's site.";
  const allowed = new Set([page.host, ...extraHosts.map((host) => host.toLowerCase().replace(/^www\./, ""))]);
  if (!allowed.has(form.host)) return "The test form has to be on the same site as the page.";
  return null;
}

export function isMonitorTestLead(record: {
  source?: string | null;
  email?: string | null;
  fields?: Record<string, unknown> | null;
  headers?: Record<string, unknown> | null;
}) {
  if ((record.source || "").trim() === "page_monitor_test") return true;
  if ((record.email || "").trim().toLowerCase() === TEST_LEAD_EMAIL) return true;
  const fields = record.fields ?? {};
  if (String(fields[TEST_LEAD_FIELD] ?? "") === "1") return true;
  const headers = record.headers ?? {};
  const header = headers[TEST_LEAD_HEADER] ?? headers[TEST_LEAD_HEADER.toUpperCase()];
  return String(header ?? "") === "1";
}

export function withoutMonitorTestLeads<T>(
  rows: T[],
  read: (row: T) => { source?: string | null; email?: string | null; fields?: Record<string, unknown> | null },
) {
  return rows.filter((row) => !isMonitorTestLead(read(row)));
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const MAX_HTML = 500_000;
const MAX_REDIRECTS = 3;

function sameSite(from: string, to: string) {
  const left = sitePath(from);
  const right = sitePath(to);
  if (!left || !right) return false;
  return left.host === right.host;
}

async function readPublic(url: string, fetchImpl: FetchLike, timeoutMs: number, hops = 0): Promise<{
  httpStatus: number | null;
  html: string;
  ttfbMs: number | null;
  loadMs: number | null;
  timedOut: boolean;
  detail: string;
}> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const ttfbMs = Date.now() - started;
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location || hops >= MAX_REDIRECTS) {
        return { httpStatus: status, html: "", ttfbMs, loadMs: Date.now() - started, timedOut: false, detail: "Too many redirects." };
      }
      const next = new URL(location, url).toString();
      if (publicUrlIssue(next) || !sameSite(url, next)) {
        return { httpStatus: status, html: "", ttfbMs, loadMs: Date.now() - started, timedOut: false, detail: "Redirect left the page's site." };
      }
      return readPublic(next, fetchImpl, timeoutMs, hops + 1);
    }
    const html = (await response.text()).slice(0, MAX_HTML);
    const httpOk = status >= 200 && status < 300;
    return {
      httpStatus: status,
      html,
      ttfbMs,
      loadMs: Date.now() - started,
      timedOut: false,
      detail: httpOk ? "" : `The server returned ${status}.`,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      httpStatus: null,
      html: "",
      ttfbMs: null,
      loadMs: Date.now() - started,
      timedOut,
      detail: timedOut ? "The check timed out." : "The page did not respond.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeCanary(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 8_000) {
  if (publicUrlIssue(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "manual", signal: controller.signal });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probePage(input: {
  url: string;
  region: string;
  expectForm: boolean;
  formTestUrl?: string;
  submitForm?: boolean;
  extraFormHosts?: string[];
  fetchImpl?: FetchLike;
  now?: Date;
  timeoutMs?: number;
}): Promise<PageSample> {
  const now = input.now ?? new Date();
  const blocked = publicUrlIssue(input.url);
  if (blocked) {
    return {
      at: now.toISOString(),
      region: input.region,
      status: "down",
      loadMs: null,
      ttfbMs: null,
      httpStatus: null,
      formPresent: false,
      formSubmitOk: null,
      pixels: emptyPixels(),
      detail: blocked,
    };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const result = await readPublic(input.url, fetchImpl, input.timeoutMs ?? 10_000);
  const parsed = result.html ? analyzeHtml(result.html) : { formPresent: false, pixels: emptyPixels() };
  let formSubmitOk: boolean | null = null;
  let detail = result.detail;
  const formTestUrl = (input.formTestUrl || "").trim();
  if (input.submitForm && formTestUrl && result.httpStatus && result.httpStatus >= 200 && result.httpStatus < 400) {
    const targetIssue = formTargetIssue(input.url, formTestUrl, input.extraFormHosts);
    if (targetIssue) {
      formSubmitOk = false;
      detail = targetIssue;
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
        const body = new URLSearchParams({
          [TEST_LEAD_FIELD]: "1",
          name: "VoiceOps page check",
          email: TEST_LEAD_EMAIL,
        });
        const posted = await fetchImpl(formTestUrl, {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            [TEST_LEAD_HEADER]: "1",
          },
          body,
        });
        clearTimeout(timer);
        formSubmitOk = posted.status >= 200 && posted.status < 400;
        if (!formSubmitOk) detail = "The test lead did not send.";
      } catch {
        formSubmitOk = false;
        detail = "The test lead did not send.";
      }
    }
  }
  const httpOk = result.httpStatus !== null && result.httpStatus >= 200 && result.httpStatus < 300;
  const status = classifySample({
    httpOk,
    timedOut: result.timedOut,
    loadMs: result.loadMs,
    formPresent: parsed.formPresent,
    formSubmitOk,
    expectForm: input.expectForm,
  });
  return {
    at: now.toISOString(),
    region: input.region,
    status,
    loadMs: result.loadMs,
    ttfbMs: result.ttfbMs,
    httpStatus: result.httpStatus,
    formPresent: parsed.formPresent,
    formSubmitOk,
    pixels: parsed.pixels,
    detail,
  };
}

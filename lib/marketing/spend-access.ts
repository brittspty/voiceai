import { allClientsViewerSeesCost, type Env } from "./config";

/**
 * Specificity staff who may receive spend, bid, and figures derived from them.
 * super_admin, admin, and account_manager. The client owner (role owner) is not staff.
 * all_clients_viewer only when ALL_CLIENTS_VIEWER_SEES_COST is explicitly on.
 * Any other role, including a role added later, does not see these figures.
 */
const STAFF_SPEND_ROLES = new Set(["super_admin", "admin", "account_manager"]);

export function canSeeSpend(
  session: { role?: string | null; kind?: string | null } | null | undefined,
  env: Env = process.env,
): boolean {
  if (!session) return false;
  const role = (session.role || "").trim().toLowerCase();
  const kind = (session.kind || "").trim().toLowerCase();
  if (role === "all_clients_viewer" || kind === "all_clients_viewer") return allClientsViewerSeesCost(env);
  if (STAFF_SPEND_ROLES.has(role)) return true;
  if (kind === "super_admin" || kind === "account_manager") return true;
  return false;
}

/**
 * UI gate for spend, bid, CPA, CPL, ROAS, and budget.
 * Same rule as canSeeSpend. A share link has no staff role and does not pass.
 */
export function canSeeMoney(role: string | null | undefined, env: Env = process.env) {
  return canSeeSpend({ role, kind: role }, env);
}

/** Staff receive the payload unchanged. Everyone else gets the safe-field allowlist. */
export function forSpendViewer<T>(
  value: T,
  session: { role?: string | null; kind?: string | null } | null | undefined,
  env: Env = process.env,
): T {
  if (canSeeSpend(session, env)) return value;
  return projectWithoutSpend(value);
}

export function spendKey(key: string) {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/**
 * Fields a non-staff payload may keep. A key that is not listed here is dropped,
 * including a money field that did not exist when this list was written.
 */
const SAFE_KEYS = new Set(
  [
    "id", "name", "label", "title", "status", "type", "kind", "href", "url", "date", "dates",
    "range", "period", "leads", "clicks", "impressions", "reach", "frequency", "qualified",
    "booked", "conversions", "verified", "verifiedconversions", "verifiedleads", "verifiedhumanconversions",
    "client", "clientid", "clientname", "platform", "channel", "channels", "campaign", "campaigns",
    "campaignids", "ad", "ads", "creative", "creatives", "audience", "audiences", "segments",
    "timeline", "goals", "weekly", "cta", "ctalabel", "ctahref", "dashboard", "showcost",
    "notes", "note", "detail", "details", "reason", "reasons", "headline", "subhead",
    "footer", "updated", "updatedat", "updatedminutesago", "example", "exampledata", "placeholder",
    "connected", "match", "matchlabel", "percent", "hold", "hierarchy", "metrics", "value",
    "series", "color", "delta", "meaning", "kpis", "funnel", "flags", "pdf", "attribution",
    "items", "rows", "columns", "more", "morelabel", "morelink", "morechannels", "view", "views",
    "publicname", "platformlabel", "chip", "badge", "ours", "compare", "serving", "bots", "feed",
    "decisions", "report", "weeks", "illustrative", "email", "phone", "maid", "matched", "lineage",
    "uploaded", "sample", "clients", "totals", "definition", "direction", "group", "count",
    "path", "nodes", "confidence", "confidencebars", "lift", "liftlabel", "why", "basedon",
    "overlap", "winner", "recommendation", "recommendationonly", "workedout", "groups",
    "selection", "selections", "logic", "measurable", "quality", "qualitylabel", "provisional",
    "stale", "refreshed", "maids", "maidslabel", "leadquality", "dimension", "banner",
    "samplelabel", "sampleratio", "tablename", "tablecaption", "points", "splits", "spark",
    "tone", "format", "unit", "goal", "goallabel", "why", "audienceid", "audiencename",
    "selectioncount", "source", "sourcelabel", "datalabel", "consentbasis", "refreshcadence",
    "acquisitiondate", "size", "freshness", "freshnesslabel", "tags", "platforms", "holdverdict",
    "pixelvisitors", "pushstatus", "undountil", "statuslabel", "dataquality", "scope",
    "verifiedconversionratelabel", "qualityscore", "key", "listid", "gppstring",
    "periodlabel", "comparelabel", "rangelabel", "scopelabel", "clientheadline", "clientsubhead",
    "defaultseriesid", "annotations", "channelheading", "flagsheading", "kicker", "coversentence", "splittext",
    "resultskicker", "resultstitle", "preparer", "annotation", "periodname", "share", "text",
    "body", "logged", "delivery", "message", "sent", "includescost", "schedule", "schedules",
    "author", "loggedat", "clientbody", "seriesid", "staffname", "clientname", "qualifiedleads",
    "bookedcalls", "adviews", "rangestart", "rangeend", "sharedby", "expires", "viewonly",
    "campaignstatus", "testing", "callsanswered", "activecampaigns", "hidden", "figure",
    "metrics", "updatedminutesago", "zone", "asof", "contribution", "workspaceid", "voiceenabled",
    "subtitle", "agentname", "timezone", "mark", "logourl", "brandcolor", "wordmark", "tagline",
    "productline", "opening", "outcome", "outcomes", "transcript", "duration", "directionlabel",
    "caller", "contact", "contacts", "office", "offices", "hours", "weekday", "open", "close",
    "closed", "advisor", "advisors", "appointment", "appointments", "page", "pages", "checks",
    "passed", "failed", "score", "band", "explanation", "explanations", "decision", "decisionid",
    "severity", "driver", "clientid", "unread", "readat", "createdat", "slug", "code", "state",
    "logo", "logosrc", "logomime", "channels", "audiences", "segments", "weekly", "goals",
    "impressionshare", "searchterm", "uptime", "actions", "description", "step", "steps",
    "shareofparent", "parent", "children", "node", "column", "columns", "vertical",
    "checklist", "stopped", "learning", "stilllearning", "probability", "days", "arm",
    "arms", "holdout", "exposed", "control", "incremental", "attributed", "label",
    "publicheadline", "headline", "reasons", "frequency", "ctr", "prior", "current",
    "drop", "rise", "window", "windowlabel", "from", "to", "hrefs", "nav", "groupname",
    "on", "disabled", "role", "roles", "person", "people", "added", "totp", "totpenabled",
    "email", "business", "message", "subject", "preview", "mode", "testmode", "livemode",
    "calls", "bookings", "quotes", "forms", "visitors", "sessions", "bounce", "device",
    "country", "region", "metro", "age", "intent", "behavior", "sourceid", "sourcename",
    "refreshedat", "provisional", "matchrows", "short", "full", "connection", "status",
    "completedviews", "viewthroughrate", "completionrate", "householdsreached", "households",
    "identity", "segments", "delivery", "writesads",
    "example", "illustrative", "badge", "note", "uploaded", "matched", "lineage",
    "feed", "decisions", "leads", "report", "weeks", "title", "client", "platform",
    "verifiedconversions", "impressions", "clicks", "serving", "bots", "audiences",
    "compare", "chip", "view", "totals", "clients", "phone", "email", "maid",
    "sample", "goals", "timeline", "cta", "dashboard", "showcost", "channels",
    "rangestart", "qualifiedrate", "calledwithin", "people", "bookings",
    "adviews", "meaning", "delta", "kpis", "campaigns", "updated", "sharedby", "expires",
    "viewonly", "notes", "detail", "channel", "booked", "status", "name",
    "objective", "adgroups", "adcount", "date", "ingestedat", "platformleads",
    "platformconversions", "hour", "minute", "clock", "period", "count", "total",
    "ratelabel", "trend", "automatic", "manual", "mark", "override", "by", "at",
    "choice", "audience", "owner", "staff", "clear", "qualified", "unqualified", "spam",
    "window", "start", "end", "label", "value", "share", "id", "color", "points",
    "splits", "date", "series", "flags", "title", "detail", "pdf", "footer",
    "attribution", "headline", "subhead", "kicker", "annotation", "preparer",
    "resultskicker", "resultstitle", "coversentence", "periodname", "clientpdf",
    "funnel", "step", "steps", "channelheading", "flagsheading", "defaultseriesid",
    "updatedat", "exampledata", "sourceid", "scopelabel", "periodlabel", "comparelabel",
    "compare", "range", "clientid", "clientname", "audience", "annotations",
    "body", "seriesid", "loggedat", "clientbody", "authorname",
    "includescost", "nocost", "yes", "no", "row", "rows", "caption", "tablecaption",
    "banner", "qualified", "leads", "booked", "points", "name", "id",
    "morechannels", "connection", "matchlabel", "hierarchy", "metrics", "placeholder",
    "connected", "example", "booked", "qualified", "leads", "href", "status", "label",
    "public", "staffonly", "definition", "direction", "glossary", "tip", "tips",
    "items", "severity", "driver", "reason", "title", "id", "clientid", "urgentemail",
    "logged", "optin", "kind", "href",
    "ok", "error", "message", "enabled", "off", "on",
    "passcode", "expiresat", "revoked", "revokedat", "createdat", "createdby",
    "snapshot", "token", "url", "link", "links",
    "impressions", "clicks", "platformleads", "date", "campaign", "name",
    "adviews", "qualified", "period", "notes", "testing",
    "goals", "channels", "audiences", "segments", "timeline", "weekly",
    "ctalabel", "ctahref", "clientname", "logosrc", "dashboard", "showcost",
    "slug", "code", "state",
    "locked", "rules", "adaccountwrite", "campaignwrite", "cutafterminimumsample",
    "lowmatchrate", "maxdays", "minconversionsperarm", "mindays", "probabilitytobeatbest",
    "twoproportionalpha", "reportsp1live", "pvalue", "writes", "match", "cut", "conversions",
    "window", "days", "probability",
    "selected", "shareofparent", "pathsummary", "mobile", "whylabel", "overlapnote",
    "dimensions", "parentlabel", "manualnote", "manualsteps", "log", "choice",
    "bysource", "windows", "points", "recommendation", "workedout", "why", "title",
    "parts", "matchedany", "placeholder", "unmatched", "sent", "short", "category",
    "uploaded", "matched", "unmatched", "sent", "short", "category", "from", "to",
    "recommendationonly", "recommendations", "vertical", "basedon", "label",
    "example", "source", "mode", "recommendationsonly",
    "tests", "checklist", "met", "text", "daylabel", "onhold", "holdlabel", "summary",
    "moneyincopy", "audience", "p1", "level", "levels", "filter", "filters",
    "children", "node", "nodes", "column", "columns",
    "vendor", "vendorid", "summary", "decisions", "datacpm",
    "delivery", "devices", "publishers", "segments", "warnings", "sensitivity",
    "lag", "assists", "windows", "nativelabel", "verifiedhumanlabel",
    "changesdefault", "view3days", "view7days", "exposedhouseholds", "sitevisits",
    "leadsandconversions", "uniqueimpressions", "completion25", "completion50",
    "completion75", "completion100", "reportedclickconversions", "reportedviewconversions",
    "ipconversions", "cookieconversions", "maidlistid", "subsegmentkey",
    "deterministicmatchrate", "verifiedclickconversions", "verifiedviewconversions",
    "deterministicclickconversions", "deterministicviewconversions", "allmatchedconversions",
    "liftcilow", "liftcihigh", "householdids", "iphashes", "identity",
    "alerts", "recommendations", "notes", "user", "userid",
  ].map(spendKey),
);

const MONEY_TEXT = /\$|\b(spend|budgets?|costs?|cpc|cpm|cpa|cpl|cpql|roas|bids?|revenue|micros)\b/i;

export function moneyText(value: string) {
  return MONEY_TEXT.test(value);
}

/** Keep only safe fields. Staff must not call this; they receive the original payload. */
export function projectWithoutSpend<T>(value: T): T {
  return project(value) as T;
}

function project(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(project).filter((item) => item !== undefined);
  }
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const token = spendKey(key);
      if (!SAFE_KEYS.has(token)) continue;
      if (token === "showcost") {
        next[key] = false;
        continue;
      }
      const cleaned = project(child);
      if (cleaned === undefined) continue;
      next[key] = cleaned;
    }
    return next;
  }
  if (typeof value === "string") return moneyText(value) ? undefined : value;
  return value;
}

import { isForbiddenMetricId } from "../metric-visibility";

export type ProspectReader = "staff" | "client" | "share";

export type ProspectView = {
  id: string;
  clientId: string;
  source: "traxy" | "apollo";
  displayName: string;
  headline: string;
  company: string;
  location: string;
  emails: string[];
  phones: string[];
  profileUrl: string;
  icpMatchPercent: number | null;
  intentScore: number | null;
  tier: string;
  signal: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

const PROSPECT_FIELDS = new Set([
  "id",
  "clientid",
  "source",
  "displayname",
  "headline",
  "company",
  "location",
  "emails",
  "phones",
  "profileurl",
  "icpmatchpercent",
  "intentscore",
  "tier",
  "signal",
  "firstseenat",
  "lastseenat",
  "externalid",
  "workspaceid",
]);

function token(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Drops spend, budget, bid, CPx, ROAS, and other cost keys. Prospect fields such as ICP match stay. */
export function stripProspectCost(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripProspectCost(item));
  if (!value || typeof value !== "object") return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!PROSPECT_FIELDS.has(token(key)) && isForbiddenMetricId(key)) continue;
    next[key] = stripProspectCost(child);
  }
  return next;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function whole(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function stamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

/**
 * Staff see contact fields. Client and share readers do not, and neither receives cost fields.
 * The raw provider payload is never copied onto the view.
 */
export function presentProspect(input: Record<string, unknown>, reader: ProspectReader): ProspectView {
  const source = input.source === "apollo" ? "apollo" : "traxy";
  const view: ProspectView = {
    id: text(input.id),
    clientId: text(input.clientId),
    source,
    displayName: text(input.displayName) || "Unnamed prospect",
    headline: text(input.headline),
    company: text(input.company),
    location: text(input.location),
    emails: reader === "staff" ? stringList(input.emails) : [],
    phones: reader === "staff" ? stringList(input.phones) : [],
    profileUrl: reader === "staff" ? text(input.profileUrl) : "",
    icpMatchPercent: whole(input.icpMatchPercent),
    intentScore: typeof input.intentScore === "number" && Number.isFinite(input.intentScore) ? input.intentScore : null,
    tier: text(input.tier),
    signal: text(input.signal),
    firstSeenAt: stamp(input.firstSeenAt),
    lastSeenAt: stamp(input.lastSeenAt),
  };
  return stripProspectCost(view) as ProspectView;
}

export type ProspectEmpty = { title: string; body: string } | null;

export function prospectEmptyState(input: {
  source: "" | "traxy" | "apollo";
  clientSelected: boolean;
  rowCount: number;
  traxyLiveRead: boolean;
  apolloLiveRead: boolean;
  apolloSavedOnly: boolean;
}): ProspectEmpty {
  if (input.rowCount > 0) return null;
  if (!input.clientSelected) {
    return {
      title: "No prospects yet",
      body: "Choose a client to see people from Traxy or Apollo. Nothing on this page is sent to an ad platform.",
    };
  }
  if (input.source === "traxy" && !input.traxyLiveRead) {
    return {
      title: "Traxy is not connected",
      body: "This client is not reading Traxy yet. Map the Traxy workspace and turn on live read, then people will show up here after a sync.",
    };
  }
  if (input.source === "apollo" && !input.apolloLiveRead) {
    return {
      title: "Apollo is not connected",
      body: "This client is not reading Apollo yet. Map the Apollo account and turn on live read, then people will show up here after a sync.",
    };
  }
  if (input.source === "apollo" && input.apolloSavedOnly) {
    return {
      title: "Apollo saved search is saved",
      body: "The saved search is stored on this client. jAI does not query it yet, because Apollo's public API has no credit-free saved-search read. Add a list to sync people.",
    };
  }
  if (input.source === "traxy") {
    return {
      title: "No Traxy prospects yet",
      body: "Live read is on. The next sync will add people from the mapped Traxy workspace.",
    };
  }
  if (input.source === "apollo") {
    return {
      title: "No Apollo prospects yet",
      body: "Live read is on. The next sync will add people from the mapped Apollo lists.",
    };
  }
  if (!input.traxyLiveRead && !input.apolloLiveRead) {
    return {
      title: "Traxy and Apollo are not connected",
      body: "Neither source is reading for this client. Turn on live read for Traxy, Apollo, or both. People stay in jAI until a later step adds a selection to an audience.",
    };
  }
  return {
    title: "No prospects yet",
    body: "A source is connected. People will show up here after the next sync.",
  };
}

/** The prospects page follows the lead-quality gate. Client viewers and share links stay out. */
export function canOpenProspects(kind: string) {
  return kind === "super_admin" || kind === "account_manager" || kind === "staff" || kind === "client_owner" || kind === "all_clients_viewer";
}

export const ACCESS_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Server-owned labels. A posted key that is not here is ignored. */
export const ACCESS_PAGE_LABELS: Record<string, string> = {
  "all-clients": "All clients",
  audiences: "Audiences",
  "audience-data": "Audience Data",
  ctv: "CTV",
  decisions: "Decisions",
  "drill-down": "Drill-down",
  "holdout-tests": "Holdout tests",
  home: "Home",
  inbox: "Inbox",
  insights: "Insights",
  "landing-pages": "Landing pages",
  lineage: "Lineage",
  "live-notes": "Live notes",
  "negative-keywords": "Negative keywords",
  "new-skill-offered": "New skill offered",
  people: "People",
  "pixel-tracking": "Pixel tracking",
  "resolution-data": "Resolution Data",
  results: "Results",
  roles: "Roles",
  "segment-tests": "Segment tests",
  "this-page": "This page",
  "competitor-ads": "Competitor ads",
};

const ASK_TEAM_ROLES = new Set(["owner", "client_viewer", "demo_viewer"]);

export function accessPageKey(title: string) {
  const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return key in ACCESS_PAGE_LABELS ? key : null;
}

export function accessPageLabel(key: string) {
  return ACCESS_PAGE_LABELS[key] ?? null;
}

/** Client, client viewer, and demo roles cannot file an access request. */
export function canRequestPageAccess(role: string | null | undefined) {
  return !ASK_TEAM_ROLES.has((role || "").trim().toLowerCase());
}

/** A request inside the window is already sent. An older one can be stored again. */
export function decideAccessRequest(existingAt: Date | null, now: Date) {
  if (!existingAt) return "create" as const;
  const age = now.getTime() - existingAt.getTime();
  if (age >= 0 && age < ACCESS_REQUEST_WINDOW_MS) return "sent" as const;
  return "create" as const;
}

export type AccessRequestDeps = {
  now: Date;
  existingAt: Date | null;
  adminIds: string[];
  create: () => Promise<void>;
  notify: (adminIds: string[]) => Promise<void>;
};

/** Stores one request and notifies staff admins. A repeat inside 24 hours does neither. */
export async function recordPageAccessRequest(deps: AccessRequestDeps) {
  const decision = decideAccessRequest(deps.existingAt, deps.now);
  if (decision === "sent") return { created: false, sent: true };
  await deps.create();
  if (deps.adminIds.length) await deps.notify(deps.adminIds);
  return { created: true, sent: true };
}

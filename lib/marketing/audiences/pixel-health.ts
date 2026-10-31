import { createHash } from "node:crypto";
import { assertNoAdBudgetWrite } from "../connectors/budget-lock";
import { buildGooglePayload, buildMetaPayload, buildStackAdaptPayload, type AudiencePlatform } from "./payloads";

export const PIXEL_FIX_GUIDE = [
  "Add the audience id to the landing page URL as aud and utm_content.",
  "Fire a page_view with that audience id, a visitor id, and the page URL.",
  "Come back here. A healthy page has an event in the last day, and the pool shows new visitors.",
  "Sync the pool to Meta, Google, and StackAdapt. The sync only writes a dry-run log.",
] as const;

export const POOL_SYNC_PLATFORMS = ["meta", "google_customer_match", "stackadapt"] as const;
export type PoolSyncPlatform = (typeof POOL_SYNC_PLATFORMS)[number];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type PixelEventRow = {
  pageUrl: string;
  eventName: string;
  visitorId: string;
  audienceId: string;
  occurredAt: string;
};

export type PixelPageHealth = {
  pageUrl: string;
  pageName: string;
  health: "healthy" | "quiet" | "down";
  healthLabel: string;
  eventsCaptured: number;
  lastEventAt: string | null;
};

export type PoolGrowth = {
  audienceId: string;
  name: string;
  listId: string;
  size: number;
  addedThisWeek: number;
  growthLabel: string;
};

function hashVisitor(visitorId: string) {
  return createHash("sha256").update(visitorId.trim(), "utf8").digest("hex");
}

export function pixelPageHealth(input: {
  pages: { name: string; url: string }[];
  events: PixelEventRow[];
  now: Date;
}): PixelPageHealth[] {
  const known = new Map<string, string>();
  for (const page of input.pages) {
    const url = page.url.trim();
    if (url) known.set(url, page.name || url);
  }
  for (const event of input.events) {
    const url = event.pageUrl.trim() || "Unknown page";
    if (!known.has(url)) known.set(url, url);
  }
  const rows: PixelPageHealth[] = [];
  for (const [pageUrl, pageName] of known) {
    const mine = input.events.filter((event) => (event.pageUrl.trim() || "Unknown page") === pageUrl);
    const last = mine.map((event) => Date.parse(event.occurredAt)).filter((time) => Number.isFinite(time)).sort((a, b) => b - a)[0];
    const age = last === undefined ? null : input.now.getTime() - last;
    const health = age === null ? "down" : age <= DAY_MS ? "healthy" : age <= WEEK_MS ? "quiet" : "down";
    const healthLabel = health === "healthy" ? "Healthy" : health === "quiet" ? "Quiet" : "Down";
    rows.push({
      pageUrl,
      pageName,
      health,
      healthLabel,
      eventsCaptured: mine.length,
      lastEventAt: last === undefined ? null : new Date(last).toISOString(),
    });
  }
  return rows.sort((a, b) => a.pageName.localeCompare(b.pageName));
}

export function poolGrowth(input: {
  audiences: { id: string; name: string; listId: string }[];
  events: PixelEventRow[];
  now: Date;
}): PoolGrowth[] {
  const weekStart = input.now.getTime() - WEEK_MS;
  return input.audiences.map((audience) => {
    const mine = input.events.filter((event) => event.audienceId === audience.id && event.visitorId.trim());
    const firstSeen = new Map<string, number>();
    for (const event of mine) {
      const at = Date.parse(event.occurredAt);
      const prior = firstSeen.get(event.visitorId);
      if (prior === undefined || at < prior) firstSeen.set(event.visitorId, at);
    }
    const size = firstSeen.size;
    const addedThisWeek = [...firstSeen.values()].filter((at) => at >= weekStart).length;
    const growthLabel = addedThisWeek === 0 ? "No new visitors this week" : `+${addedThisWeek} this week`;
    return { audienceId: audience.id, name: audience.name, listId: audience.listId, size, addedThisWeek, growthLabel };
  }).sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
}

export function dryRunPoolSync(input: { platform: PoolSyncPlatform; visitorIds: string[]; listId: string; vendor: string }) {
  const members = [...new Set(input.visitorIds.map((id) => id.trim()).filter(Boolean))].map((visitorId) => ({
    idType: "email_sha256" as const,
    hash: hashVisitor(visitorId),
  }));
  const payload = input.platform === "meta"
    ? buildMetaPayload(members)
    : input.platform === "google_customer_match"
      ? buildGooglePayload(members, "pixel retargeting pool")
      : buildStackAdaptPayload(members);
  const endpoint = `dry-run://${input.platform}/pixel-pool`;
  assertNoAdBudgetWrite({ method: "POST", url: endpoint, body: payload });
  return {
    platform: input.platform as AudiencePlatform,
    called: false as const,
    mode: "dry_run" as const,
    endpoint,
    payload,
    log: `Dry run ${input.platform} pool for list ${input.listId} from ${input.vendor}. ${members.length} visitors. Nothing was sent.`,
    steps: [
      `Open ${input.platform === "meta" ? "Meta" : input.platform === "google_customer_match" ? "Google Ads" : "StackAdapt"}.`,
      "Create or open the retargeting audience.",
      "Upload is not available from here. This log is the dry run.",
      "Do not enter a budget or a bid.",
    ],
  };
}

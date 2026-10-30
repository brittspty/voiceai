import { competitorCopyIsPublic, type PublicAd } from "./connectors/ad-library";

export const MAX_COMPETITORS = 5;

export type CompetitorInput = {
  name: string;
  pageId?: string;
  website?: string;
  searchTerms?: string[];
};

export function competitorAddDecision(count: number) {
  if (count >= MAX_COMPETITORS) {
    return { ok: false as const, message: `You can watch up to ${MAX_COMPETITORS} competitors.` };
  }
  return { ok: true as const };
}

export function cleanCompetitorInput(input: CompetitorInput): { ok: true; value: Required<Pick<CompetitorInput, "name" | "pageId" | "website" | "searchTerms">> } | { ok: false; message: string } {
  const name = input.name.trim();
  const pageId = (input.pageId || "").trim();
  const website = (input.website || "").trim();
  const searchTerms = [...new Set((input.searchTerms || []).map((term) => term.trim()).filter(Boolean))].slice(0, 5);
  if (!name) return { ok: false, message: "Enter the business name." };
  if (name.length > 120) return { ok: false, message: "Use a shorter business name." };
  if (!pageId && !website && !searchTerms.length) {
    return { ok: false, message: "Add a Facebook page or a website." };
  }
  if (pageId && !/^\d{5,}$/.test(pageId)) return { ok: false, message: "The Facebook page id should be numbers only." };
  return { ok: true, value: { name, pageId, website, searchTerms } };
}

export type AdCard = {
  id?: string;
  competitorName: string;
  headline: string;
  body: string;
  pageName: string;
  snapshotUrl: string;
  sourceLabel: string;
  runningSince: string;
  active: boolean;
  firstSeen: string;
  isNew: boolean;
  longRunning: boolean;
};

export function runningSinceLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "Running";
  const formatted = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  return `Running since ${formatted}`;
}

export function presentCompetitorAd(input: {
  id?: string;
  competitorName: string;
  ad: Pick<PublicAd, "headline" | "body" | "pageName" | "snapshotUrl" | "firstSeen" | "active">;
  now?: Date;
}): AdCard {
  const now = input.now ?? new Date();
  const first = Date.parse(`${input.ad.firstSeen}T00:00:00.000Z`);
  const ageDays = Number.isFinite(first) ? (now.getTime() - first) / 86_400_000 : 0;
  const card: AdCard = {
    id: input.id,
    competitorName: input.competitorName,
    headline: input.ad.headline || "Ad",
    body: input.ad.body,
    pageName: input.ad.pageName,
    snapshotUrl: input.ad.snapshotUrl,
    sourceLabel: "Meta Ad Library",
    runningSince: runningSinceLabel(input.ad.firstSeen),
    active: input.ad.active,
    firstSeen: input.ad.firstSeen,
    isNew: ageDays <= 7,
    longRunning: ageDays >= 30 && input.ad.active,
  };
  return card;
}

export function competitorWeeklySummary(
  competitors: { name: string; ads: { firstSeen: string; headline: string }[] }[],
  since: Date,
) {
  const cutoff = since.toISOString().slice(0, 10);
  const lines: string[] = [];
  for (const competitor of competitors) {
    const fresh = competitor.ads.filter((ad) => ad.firstSeen >= cutoff);
    if (!fresh.length) continue;
    const topic = fresh.map((ad) => ad.headline.trim()).find((headline) => headline && competitorCopyIsPublic(headline));
    const about = topic ? ` about '${topic}'` : "";
    const noun = fresh.length === 1 ? "ad" : "ads";
    const line = `${competitor.name} started ${fresh.length} new ${noun}${about}.`;
    if (competitorCopyIsPublic(line)) lines.push(line);
  }
  return lines;
}

export function draftIdeaFromAd(ad: { headline: string; body: string }) {
  return {
    headline: ad.headline.trim() || "New version",
    body: ad.body.trim(),
    status: "draft" as const,
  };
}

export function publicGallery(cards: AdCard[]) {
  return cards.map((card) => ({
    competitorName: card.competitorName,
    headline: card.headline,
    body: card.body,
    runningSince: card.runningSince,
    sourceLabel: card.sourceLabel,
    snapshotUrl: card.snapshotUrl,
  }));
}

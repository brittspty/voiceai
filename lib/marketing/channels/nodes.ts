export type DrillLevel = "client" | "channel" | "campaign" | "ad_group" | "ad" | "keyword" | "search_term" | "location";

export type DrillCrumb = {
  label: string;
  href: string | null;
  current: boolean;
};

export function contributionShare(childDelta: number, parentDelta: number) {
  if (!parentDelta) return 0;
  return childDelta / parentDelta;
}

export function explainingNode<T extends { share: number; depth: number }>(nodes: T[]) {
  return nodes.filter((node) => node.share >= 0.5).sort((a, b) => b.depth - a.depth || b.share - a.share)[0] ?? null;
}

const CHANNEL_SLUG: Record<string, string> = {
  meta: "meta",
  google_ads: "google-ads",
  stackadapt: "stackadapt",
  google_business_profile: "google-business-profile",
  chatgpt_ads: "chatgpt-ads",
};

export function channelSlug(channel: string) {
  return CHANNEL_SLUG[channel] ?? channel;
}

export function channelFromSlug(slug: string) {
  if (slug === "google-ads") return "google_ads";
  if (slug === "google-business-profile") return "google_business_profile";
  if (slug === "chatgpt-ads") return "chatgpt_ads";
  if (slug === "meta" || slug === "stackadapt") return slug;
  return null;
}

export function drillHref(client: string, parts: string[]) {
  return `/c/${encodeURIComponent(client)}/${parts.map(encodeURIComponent).join("/")}`;
}

/** Sticky path from the client through channel, campaign, ad set, and ad or keyword. */
export function drillCrumbs(input: { clientLabel: string; client: string; channelLabel?: string; channelSlug?: string; campaign?: { label: string; slug: string }; adSet?: { label: string; slug: string }; leaf?: { label: string; slug: string } }): DrillCrumb[] {
  const crumbs: DrillCrumb[] = [
    { label: input.clientLabel, href: "/", current: false },
    { label: "Overview", href: "/", current: false },
  ];
  if (input.channelSlug && input.channelLabel) {
    crumbs.push({ label: input.channelLabel, href: drillHref(input.client, [input.channelSlug]), current: false });
  }
  if (input.campaign && input.channelSlug) {
    crumbs.push({ label: input.campaign.label, href: drillHref(input.client, [input.channelSlug, input.campaign.slug]), current: false });
  }
  if (input.adSet && input.channelSlug && input.campaign) {
    crumbs.push({ label: input.adSet.label, href: drillHref(input.client, [input.channelSlug, input.campaign.slug, input.adSet.slug]), current: false });
  }
  if (input.leaf && input.channelSlug && input.campaign && input.adSet) {
    crumbs.push({ label: input.leaf.label, href: null, current: true });
  }
  const last = crumbs[crumbs.length - 1];
  if (last && !input.leaf) {
    last.href = null;
    last.current = true;
  }
  return crumbs;
}

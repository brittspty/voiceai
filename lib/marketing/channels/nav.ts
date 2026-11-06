import { PRODUCT_WORDMARK } from "../../brand/names";

export type NavItem = {
  href: string;
  label: string;
  group: string;
  count?: number;
};

export function navActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/");
  if (href === "/live") return pathname === "/live" || pathname.startsWith("/live/");
  if (href === "/marketing/audiences/pixel") return pathname.startsWith("/marketing/audiences/pixel");
  if (href === "/marketing/audiences") return pathname === "/marketing/audiences";
  if (href === "/audience-data") return pathname === "/audience-data" || pathname.startsWith("/audience-data/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function jarvisNav(input: {
  audience: "staff" | "client";
  showAis2l: boolean;
  decisionCount: number;
  showLive: boolean;
  showSegments?: boolean;
  showAudiences?: boolean;
  channelLinks?: NavItem[] | null;
  showInsights?: boolean;
  showNotifications?: boolean;
  showCtv?: boolean;
  showAudienceData?: boolean;
  showAudienceDataClient?: boolean;
  showVideoChannels?: boolean;
  showMetricSettings?: boolean;
}): NavItem[] {
  const decisions: NavItem = { href: "/decisions", label: "Decisions", group: "Overview", count: input.decisionCount };
  if (input.audience === "client") {
    const items: NavItem[] = [
      { href: "/", label: `${PRODUCT_WORDMARK} home`, group: "Overview" },
      decisions,
    ];
    if (input.channelLinks?.length) items.push(...input.channelLinks);
    items.push(
      { href: "/leads", label: "Leads", group: "Conversion" },
      { href: "/sites/landing-pages", label: "Landing pages", group: "Conversion" },
    );
    if (input.showAis2l) items.push({ href: "/ais2l", label: "AIS2L", group: "Conversion" });
    if (input.showAudienceDataClient) items.push({ href: "/audience-data", label: "Audience Data", group: "Results" });
    if (input.showSegments) items.push({ href: "/marketing/segments", label: "Audience Data", group: "Results" });
    if (input.showCtv) items.push({ href: "/marketing/ctv", label: "CTV (StackAdapt)", group: "Results" });
    items.push({ href: "/reports", label: "Reports", group: "Share" });
    if (input.showMetricSettings) items.push({ href: "/marketing/metrics", label: "Client metrics", group: "Account" });
    items.push({ href: "/settings", label: "Settings & connections", group: "Account" });
    return items;
  }
  const items: NavItem[] = [
    { href: "/", label: `${PRODUCT_WORDMARK} home`, group: "Overview" },
    decisions,
  ];
  if (input.showLive) items.push({ href: "/live", label: "Live", group: "Overview" });
  if (input.showAudienceData) items.push({ href: "/audience-data", label: "Audience Data", group: "Data" });
  if (input.channelLinks?.length) items.push(...input.channelLinks);
  else {
    const channels: NavItem[] = [
      { href: "/c/all/meta", label: "Meta", group: "Channels" },
      { href: "/c/all/google-ads", label: "Google Ads", group: "Channels" },
    ];
    if (input.showVideoChannels) channels.push({ href: "/c/all/youtube", label: "YouTube", group: "Channels" });
    channels.push({ href: "/c/all/stackadapt", label: "StackAdapt", group: "Channels" });
    if (input.showVideoChannels) channels.push({ href: "/c/all/ctv", label: "CTV (StackAdapt)", group: "Channels" });
    channels.push({ href: "/c/all/google-business-profile", label: "Google Business Profile", group: "Channels" });
    items.push(...channels);
  }
  items.push(
    { href: "/sites/landing-pages", label: "Landing pages", group: "Conversion" },
    { href: "/leads", label: "Leads & pipeline", group: "Conversion" },
    { href: "/marketing/prospects", label: "Prospects", group: "Conversion" },
  );
  if (input.showAis2l) items.push({ href: "/ais2l", label: "AIS2L", group: "Conversion" });
  if (input.showSegments) items.push({ href: "/marketing/segments", label: "Audience Data", group: "Conversion" });
  if (input.showAudiences) {
    items.push({ href: "/marketing/audiences", label: "Audiences", group: "Audiences" });
    items.push({ href: "/marketing/audiences/pixel", label: "Pixel tracking", group: "Audiences" });
  }
  if (input.showCtv) items.push({ href: "/marketing/ctv", label: "CTV (StackAdapt)", group: "Channels" });
  items.push({ href: "/reports", label: "Reports", group: "Share" });
  if (input.showMetricSettings) items.push({ href: "/marketing/metrics", label: "Client metrics", group: "Account" });
  if (input.showInsights) items.push({ href: "/insights", label: "Insights", group: "Share" });
  if (input.showNotifications) items.push({ href: "/notifications", label: "Notifications", group: "Overview" });
  items.push({ href: "/settings", label: "Settings & connections", group: "Account" });
  return items;
}

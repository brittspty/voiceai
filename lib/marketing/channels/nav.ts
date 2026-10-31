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
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function jarvisNav(input: { audience: "staff" | "client"; showAis2l: boolean; decisionCount: number; showLive: boolean }): NavItem[] {
  const decisions: NavItem = { href: "/decisions", label: "Decisions", group: "Overview", count: input.decisionCount };
  if (input.audience === "client") {
    const items: NavItem[] = [
      { href: "/", label: "Home", group: "Overview" },
      decisions,
      { href: "/leads", label: "Leads", group: "Results" },
      { href: "/sites/landing-pages", label: "Landing pages", group: "Results" },
    ];
    if (input.showAis2l) items.push({ href: "/ais2l", label: "AIS2L", group: "Results" });
    items.push({ href: "/reports", label: "Reports", group: "Results" });
    items.push({ href: "/settings", label: "Settings & connections", group: "Account" });
    return items;
  }
  const items: NavItem[] = [
    { href: "/", label: "Home", group: "Overview" },
    decisions,
  ];
  if (input.showLive) items.push({ href: "/live", label: "Live", group: "Overview" });
  items.push(
    { href: "/c/all/meta", label: "Meta", group: "Channels" },
    { href: "/c/all/google-ads", label: "Google Ads", group: "Channels" },
    { href: "/c/all/stackadapt", label: "StackAdapt", group: "Channels" },
    { href: "/c/all/google-business-profile", label: "Google Business Profile", group: "Channels" },
    { href: "/sites/landing-pages", label: "Landing pages", group: "Conversion" },
    { href: "/leads", label: "Leads & pipeline", group: "Conversion" },
  );
  if (input.showAis2l) items.push({ href: "/ais2l", label: "AIS2L", group: "Conversion" });
  items.push({ href: "/reports", label: "Reports", group: "Share" });
  items.push({ href: "/settings", label: "Settings & connections", group: "Account" });
  return items;
}

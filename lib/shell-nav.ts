const CLIENT_SHELL_ROLES = new Set(["owner", "client_viewer"]);

/** Client owners and client viewers use the client nav. Everyone else uses the staff nav. */
export function usesStaffNav(role: string) {
  return !CLIENT_SHELL_ROLES.has(role);
}

/** A client sees YouTube or LinkedIn only after that channel is connected. */
export function clientChannelNav(input: { youtubeConnected: boolean; linkedinConnected: boolean }) {
  const items: { href: string; label: string }[] = [];
  if (input.youtubeConnected) items.push({ href: "/c/all/youtube", label: "YouTube" });
  if (input.linkedinConnected) items.push({ href: "/c/all/linkedin", label: "LinkedIn" });
  return items;
}

export function optionalStaffLinks(input: { showInsights: boolean; showNotifications: boolean }) {
  const items: { href: string; label: string }[] = [];
  if (input.showInsights) items.push({ href: "/insights", label: "Insights" });
  if (input.showNotifications) items.push({ href: "/notifications", label: "Notifications" });
  return items;
}

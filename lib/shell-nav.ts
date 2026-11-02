export function optionalStaffLinks(input: { showInsights: boolean; showNotifications: boolean }) {
  const items: { href: string; label: string }[] = [];
  if (input.showInsights) items.push({ href: "/insights", label: "Insights" });
  if (input.showNotifications) items.push({ href: "/notifications", label: "Notifications" });
  return items;
}

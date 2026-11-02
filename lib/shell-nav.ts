export function optionalStaffLinks(input: { showInsights: boolean; showNotifications: boolean; showMetricSettings?: boolean }) {
  const items: { href: string; label: string }[] = [];
  if (input.showInsights) items.push({ href: "/insights", label: "Insights" });
  if (input.showNotifications) items.push({ href: "/notifications", label: "Notifications" });
  if (input.showMetricSettings) items.push({ href: "/marketing/metrics", label: "Client metrics" });
  return items;
}

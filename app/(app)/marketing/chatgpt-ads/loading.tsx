import { DashboardSkeleton } from "@/components/ux-skeleton";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default function ChatgptAdsLoading() {
  if (!uxLaunchGapsEnabled()) return null;
  return <DashboardSkeleton showMoney={false} />;
}

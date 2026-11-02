import { DashboardSkeleton } from "@/components/ux-skeleton";
import { getCurrentUser } from "@/lib/auth";
import { canSeeSpend } from "@/lib/marketing/spend-access";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default async function CtvLoading() {
  if (!uxLaunchGapsEnabled()) return null;
  const user = await getCurrentUser();
  return <DashboardSkeleton showMoney={canSeeSpend(user)} />;
}

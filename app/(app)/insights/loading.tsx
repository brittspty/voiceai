import { InsightsLoadingSkeleton } from "@/components/ai-working";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default function InsightsLoading() {
  if (!uxLaunchGapsEnabled()) return null;
  return <InsightsLoadingSkeleton />;
}

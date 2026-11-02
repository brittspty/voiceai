import { DetailSkeleton } from "@/components/ux-skeleton";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default function AudienceDetailLoading() {
  if (!uxLaunchGapsEnabled()) return null;
  return <DetailSkeleton />;
}

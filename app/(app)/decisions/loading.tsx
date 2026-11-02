import { ListSkeleton } from "@/components/ux-skeleton";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default function DecisionsLoading() {
  if (!uxLaunchGapsEnabled()) return null;
  return <ListSkeleton />;
}

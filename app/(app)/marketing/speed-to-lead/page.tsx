import { redirect } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { SpeedToLeadScreen, type SpeedCard } from "@/components/speed-to-lead-screen";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { appHomePath } from "@/lib/public-routing";
import { speedToLeadEnabled } from "@/lib/marketing/config";
import { loadSpeedPage } from "@/lib/marketing/speed-to-lead-store";
import type { SpeedLeadView } from "@/lib/marketing/speed-to-lead";

export const dynamic = "force-dynamic";

function decorate(view: SpeedLeadView): SpeedCard {
  return {
    ...view,
    landedLabel: view.landedAt ? formatDateTime(view.landedAt) : "No landing time",
    touchLabel: view.firstTouchAt ? formatDateTime(view.firstTouchAt) : "Not contacted yet",
  };
}

export default async function SpeedToLeadPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect(appHomePath());
  const saved = (await searchParams).saved === "1";
  if (!speedToLeadEnabled()) {
    return (
      <div>
        <PageTitle title="Speed-to-lead" subtitle="Turned off." />
        <p className="text-sm text-muted">Speed-to-lead is turned off. Nothing is recorded until MARKETING_SPEED_TO_LEAD is on.</p>
      </div>
    );
  }
  let summary = null;
  let error = false;
  try {
    summary = await loadSpeedPage();
  } catch {
    error = true;
  }
  const canMark = user.role !== "viewer";
  const canEditTarget = access.kind === "super_admin" || access.kind === "account_manager" || user.role === "owner" || user.role === "admin";
  return (
    <div>
      <PageTitle title="Speed-to-lead" subtitle="Time from the page landing to the first person or Avery. Times are in seconds." />
      <SpeedToLeadScreen
        cards={(summary?.waiting ?? []).map(decorate)}
        answered={(summary?.answeredToday ?? []).map(decorate)}
        headline={summary?.headline ?? "Median first response today: not enough responses yet (goal: under 30s)"}
        withinTargetPercent={summary?.withinTargetPercent ?? null}
        targetSeconds={summary?.targetSeconds ?? 30}
        canMark={canMark}
        canEditTarget={canEditTarget}
        saved={saved}
        error={error}
      />
    </div>
  );
}

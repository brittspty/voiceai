import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { SpeedToLeadScreen, type SpeedCard } from "@/components/speed-to-lead-screen";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { speedToLeadEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { loadSpeedLead } from "@/lib/marketing/speed-to-lead-store";

export const dynamic = "force-dynamic";

export default async function SpeedLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind === "client_viewer") redirect("/marketing/client");
  if (access.kind === "none") redirect("/");
  if (!speedToLeadEnabled()) redirect("/marketing/speed-to-lead");
  const { id } = await params;
  const loaded = await loadSpeedLead(id);
  if (!loaded) notFound();
  const card: SpeedCard = {
    ...loaded.view,
    landedLabel: loaded.view.landedAt ? formatDateTime(loaded.view.landedAt) : "No landing time",
    touchLabel: loaded.view.firstTouchAt ? formatDateTime(loaded.view.firstTouchAt) : "Not contacted yet",
  };
  return (
    <div>
      <PageTitle title={card.name} subtitle="Speed-to-lead" action={<Link className="text-sm font-semibold text-brand-ink underline" href="/marketing/speed-to-lead">All leads</Link>} />
      <SpeedToLeadScreen
        cards={card.waiting ? [card] : []}
        answered={card.contacted ? [card] : []}
        headline={card.contacted ? card.line : `Goal: under ${loaded.targetSeconds}s`}
        withinTargetPercent={null}
        targetSeconds={loaded.targetSeconds}
        canMark={user.role !== "viewer"}
        canEditTarget={false}
        saved={false}
        error={false}
        focus={card}
      />
    </div>
  );
}

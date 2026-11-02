import { GbpSetup } from "@/components/gbp/gbp-setup";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { googleBusinessProfileEnabled } from "@/lib/marketing/config";
import { buildGbpSetup, canManageGbp } from "@/lib/marketing/gbp-view";
import { loadMarketingAccess } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function GbpSetupPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canManageGbp(access.kind)) denyAccess();
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {!googleBusinessProfileEnabled() ? <p className="mb-3 text-sm text-muted">The Google Business Profile switch is off. This screen still uses example listings.</p> : null}
      <GbpSetup model={buildGbpSetup()} />
    </div>
  );
}

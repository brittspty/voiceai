import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { canUseChannelRegistry, exampleRegistryState, platformByKey } from "@/lib/marketing/channels/registry";
import { channelRegistryEnabled, jarvisUiV2Enabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { one, type SP } from "@/lib/params";

export const dynamic = "force-dynamic";

/** Mock provider window. Read-only scopes only. No outbound call. */
export default async function OauthMockPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!jarvisUiV2Enabled() || !channelRegistryEnabled()) redirect("/settings/connections");
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canUseChannelRegistry(access)) denyAccess();
  const key = one(await searchParams, "platform") || "linkedin";
  const platform = platformByKey(exampleRegistryState(), key);
  if (!platform || platform.status === "hidden") denyAccess();
  return (
    <main>
      <div className="top">
        <div>
          <div className="sub">Read-only example window · nothing is sent to {platform.staffLabel}</div>
          <h1>{platform.staffLabel} read-only access</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p>This window lists the read-only scopes. Ad-account writes stay off until Jason approves them.</p>
      <ul>
        {platform.scopesRead.map((scope) => (
          <li key={scope}>{scope}</li>
        ))}
      </ul>
      <p>Read only by default.</p>
      <Link className="btn p hit" href={`/settings/connections/add?step=capability&platform=${platform.key}`}>Back to capability check</Link>
    </main>
  );
}

import { redirect } from "next/navigation";
import { ProspectsScreen, type ProspectClientOption } from "@/components/prospects-screen";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { canOpenProspects, presentProspect, prospectEmptyState } from "@/lib/marketing/prospects/present";
import { prospectReadWhere } from "@/lib/marketing/prospects/query";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { prisma } from "@/lib/db";
import { one, type SP } from "@/lib/params";
import { appHomePath } from "@/lib/public-routing";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

function sourceOf(raw: string): "" | "traxy" | "apollo" {
  if (raw === "traxy" || raw === "apollo") return raw;
  return "";
}

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (!canOpenProspects(access.kind)) redirect(access.kind === "client_viewer" ? "/marketing/client" : appHomePath());
  const query = await searchParams;
  const source = sourceOf(one(query, "source"));
  const requestedClient = one(query, "client");
  let clients: ProspectClientOption[] = [];
  try {
    const rows = await prisma.marketingClient.findMany({
      where: prospectReadWhere(access.workspaceId || WORKSPACE_ID),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        traxyLiveRead: true,
        apolloLiveRead: true,
        traxyConnectionName: true,
        apolloConnectionName: true,
        apolloListIds: true,
        apolloSavedSearchIds: true,
      },
    });
    clients = rows.map((row) => ({
      id: row.id,
      name: row.name,
      traxyLiveRead: row.traxyLiveRead,
      apolloLiveRead: row.apolloLiveRead,
      traxyConnectionName: row.traxyConnectionName,
      apolloConnectionName: row.apolloConnectionName,
      apolloSavedOnly: row.apolloLiveRead && row.apolloListIds.length === 0 && row.apolloSavedSearchIds.length > 0,
    }));
  } catch {
    return (
      <div>
        <PageTitle title="Prospects" subtitle="People from Traxy and Apollo." />
        <div className="rounded-xl border border-line bg-card p-6 text-sm text-ink">Couldn&apos;t load prospects. Try again in a moment.</div>
      </div>
    );
  }
  const selected = clients.find((client) => client.id === requestedClient) ?? null;
  const clientId = selected?.id ?? "";
  let views: ReturnType<typeof presentProspect>[] = [];
  try {
    const people = await prisma.marketingProspect.findMany({
      where: prospectReadWhere(access.workspaceId || WORKSPACE_ID, {
        ...(clientId ? { clientId } : {}),
        ...(source ? { source } : {}),
      }),
      orderBy: { lastSeenAt: "desc" },
      take: 200,
    });
    views = people.map((row) => presentProspect({
      id: row.id,
      clientId: row.clientId,
      source: row.source,
      displayName: row.displayName,
      headline: row.headline,
      company: row.company,
      location: row.location,
      emails: row.emails,
      phones: row.phones,
      profileUrl: row.profileUrl,
      icpMatchPercent: row.icpMatchPercent,
      intentScore: row.intentScore,
      tier: row.tier,
      signal: row.signal,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
    }, "staff"));
  } catch {
    return (
      <div>
        <PageTitle title="Prospects" subtitle="People from Traxy and Apollo." />
        <div className="rounded-xl border border-line bg-card p-6 text-sm text-ink">Couldn&apos;t load prospects. Try again in a moment.</div>
      </div>
    );
  }
  const empty = prospectEmptyState({
    source,
    clientSelected: Boolean(selected),
    rowCount: views.length,
    traxyLiveRead: selected?.traxyLiveRead ?? false,
    apolloLiveRead: selected?.apolloLiveRead ?? false,
    apolloSavedOnly: selected?.apolloSavedOnly ?? false,
  });
  return (
    <div>
      <PageTitle title="Prospects" subtitle="People Traxy and Apollo found for a client. They are not sent to an ad platform." />
      <ProspectsScreen clients={clients} clientId={clientId} source={source} rows={views} empty={empty} selected={selected} />
    </div>
  );
}

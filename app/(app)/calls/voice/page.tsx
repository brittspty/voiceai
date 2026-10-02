import { Suspense } from "react";
import { CallsExplorer } from "@/components/calls-explorer";
import { type SP } from "@/lib/params";
import { getOrg, listCalls } from "@/lib/queries";
import { prisma } from "@/lib/db";

export default async function VoicePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [data, org, published] = await Promise.all([
    listCalls(await searchParams),
    getOrg(),
    prisma.agentVersion.findFirst({ where: { status: "published" } }),
  ]);
  return (
    <div>
      <div className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-[var(--shadow)]">
        <div className="font-medium">Voice agent</div>
        <p className="mt-1 text-muted">{org.agentName} places every call through ElevenLabs over your Twilio number.</p>
        <p className="text-muted">{published ? `Version ${published.version} is live.` : "No agent version has been published yet, so nothing is live on the phone."}</p>
      </div>
      <Suspense>
        <CallsExplorer rows={data.rows} total={data.total} page={data.page} perPage={data.perPage} offices={data.offices} mode="voice" />
      </Suspense>
    </div>
  );
}

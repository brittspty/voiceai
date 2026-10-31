import Link from "next/link";
import { Suspense } from "react";
import { CallsExplorer } from "@/components/calls-explorer";
import { type SP } from "@/lib/params";
import { getOrg, listCalls } from "@/lib/queries";
import { prisma } from "@/lib/db";

export default async function VoicePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [data, org, published, voice] = await Promise.all([
    listCalls(await searchParams),
    getOrg(),
    prisma.agentVersion.findFirst({ where: { status: "published" } }),
    prisma.voiceVersion.findFirst({ where: { status: "published" }, orderBy: { version: "desc" } }),
  ]);
  return (
    <div>
      <div className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-[var(--shadow)]">
        <div className="font-medium">{voice ? `Live voice: ${voice.voiceName}` : "No voice chosen"}</div>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">{org.agentName} is your AI caller. {voice ? "This is the voice on new calls." : "Pick a voice before Avery calls anyone."}</p>
        <p className="text-muted">{published ? `Script version ${published.version} is live.` : "No script is live yet."}</p>
        <Link href="/settings/voice" className="mt-2 inline-flex h-9 items-center text-sm font-medium underline">Choose a voice</Link>
      </div>
      <Suspense>
        <CallsExplorer rows={data.rows} total={data.total} page={data.page} perPage={data.perPage} offices={data.offices} mode="voice" />
      </Suspense>
    </div>
  );
}

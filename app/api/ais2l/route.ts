import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadAis2lCalls } from "@/lib/ais2l/load";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";

/** The TEST pill and call summaries come from the server. Transcripts stay off this payload. */
export async function GET() {
  if (!jarvisUiV2Enabled()) return NextResponse.json({ error: "Off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { testMode: true } });
  const screen = await loadAis2lCalls(Boolean(org?.testMode));
  return NextResponse.json({
    testPill: screen.testPill,
    example: screen.example,
    label: screen.example ? "EXAMPLE DATA" : null,
    calls: screen.calls.map((call) => ({
      id: call.id,
      title: call.title,
      summary: call.summary,
      ghl: call.ghl,
      example: call.example,
      transcriptAvailable: call.transcript.length > 0,
    })),
  });
}

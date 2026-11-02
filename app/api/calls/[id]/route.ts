import { NextResponse } from "next/server";
import { presentCallDetail } from "@/lib/ais2l/screen";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCallRow } from "@/lib/queries";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  const call = await prisma.call.findUnique({ where: { id }, include: { contact: true, office: true } });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  const update = await prisma.crmUpdate.findFirst({ where: { callId: id }, orderBy: { createdAt: "desc" }, select: { status: true } });
  const row = toCallRow(call, { crmStatus: update?.status ?? null });
  const includeTranscript = new URL(request.url).searchParams.get("transcript") === "1";
  return NextResponse.json(presentCallDetail(row, { includeTranscript }));
}

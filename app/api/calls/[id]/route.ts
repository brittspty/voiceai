import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCallRow } from "@/lib/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await context.params;
  const call = await prisma.call.findUnique({ where: { id }, include: { contact: true, office: true } });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  return NextResponse.json(toCallRow(call));
}

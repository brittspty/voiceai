import { NextResponse } from "next/server";
import { refreshIntegrations } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const checks = await prisma.integrationCheck.findMany();
  return NextResponse.json({ checks });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role === "viewer") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  await refreshIntegrations();
  const checks = await prisma.integrationCheck.findMany();
  return NextResponse.json({ checks });
}

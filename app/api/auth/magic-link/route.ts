import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestMagicLink } from "@/lib/magic-link";
import { magicLinkStore } from "@/lib/magic-link-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const result = await requestMagicLink({
    email: body.email || "",
    userExists: async (email) => Boolean(await prisma.user.findUnique({ where: { email }, select: { id: true } })),
    store: magicLinkStore,
  });
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, sent: false, message: result.message });
}

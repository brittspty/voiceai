import { NextResponse } from "next/server";
import { findActiveUserByEmail } from "@/lib/active-user";
import { authLinkOrigin } from "@/lib/hosts";
import { requestMagicLink } from "@/lib/magic-link";
import { magicLinkStore } from "@/lib/magic-link-store";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const result = await requestMagicLink({
    email: body.email || "",
    origin: authLinkOrigin(),
    findUser: findActiveUserByEmail,
    store: magicLinkStore,
    recordMail: async (row) => {
      await prisma.mailLog.create({ data: row });
    },
  });
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, sent: false, message: result.message });
}

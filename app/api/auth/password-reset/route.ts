import { NextResponse } from "next/server";
import { findActiveUserByEmail } from "@/lib/active-user";
import { prisma } from "@/lib/db";
import { authLinkOrigin } from "@/lib/hosts";
import { clientIp, requestPasswordReset } from "@/lib/password-reset";
import { passwordResetStore } from "@/lib/password-reset-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const result = await requestPasswordReset({
    email: body.email || "",
    ip: clientIp(request.headers.get("x-forwarded-for")),
    origin: authLinkOrigin(),
    findUser: findActiveUserByEmail,
    store: passwordResetStore,
    recordMail: async (row) => {
      await prisma.mailLog.create({ data: row });
    },
  });
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.status === 429) return NextResponse.json({ error: result.error }, { status: 429 });
  return NextResponse.json({ ok: true, message: result.message });
}

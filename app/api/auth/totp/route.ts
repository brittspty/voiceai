import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { readToken, signToken, SESSION_COOKIE } from "@/lib/session-token";
import { verifyTotp } from "@/lib/totp";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { ticket?: string; code?: string };
  const ticket = await readToken(body.ticket);
  if (!ticket || ticket.kind !== "totp") {
    return NextResponse.json({ error: "That sign-in step expired. Start again." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: ticket.uid } });
  if (!user?.totpSecret || !(await verifyTotp(user.totpSecret, body.code || ""))) {
    return NextResponse.json({ error: "That code is wrong or expired." }, { status: 401 });
  }
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 12 * 24 * 3600 * 1000) },
  });
  const token = await signToken({ kind: "session", sid: session.id, exp: Math.floor(session.expiresAt.getTime() / 1000) });
  await audit({ id: user.id, name: user.name }, "Signed in with two-step verification", { type: "session", id: session.id, label: user.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 12,
  });
  return res;
}

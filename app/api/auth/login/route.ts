import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { signToken, SESSION_COOKIE } from "@/lib/session-token";

const attempts = new Map<string, { n: number; at: number }>();

function cookie(token: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 12,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const bucket = attempts.get(email) ?? { n: 0, at: Date.now() };
  if (Date.now() - bucket.at > 10 * 60 * 1000) {
    bucket.n = 0;
    bucket.at = Date.now();
  }
  if (bucket.n >= 12) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const match = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !match) {
    bucket.n += 1;
    attempts.set(email, bucket);
    return NextResponse.json({ error: "Email or password is wrong." }, { status: 401 });
  }
  attempts.delete(email);
  if (user.totpEnabled && user.totpSecret) {
    const ticket = await signToken({ kind: "totp", uid: user.id, exp: Math.floor(Date.now() / 1000) + 300 });
    return NextResponse.json({ totpRequired: true, ticket });
  }
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 12 * 24 * 3600 * 1000) },
  });
  const token = await signToken({ kind: "session", sid: session.id, exp: Math.floor(session.expiresAt.getTime() / 1000) });
  await audit({ id: user.id, name: user.name }, "Signed in", { type: "session", id: session.id, label: user.email });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookie(token));
  return res;
}

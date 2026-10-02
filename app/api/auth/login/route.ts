import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { signToken, SESSION_COOKIE } from "@/lib/session-token";

const attempts = new Map<string, { n: number; at: number }>();

function originOf(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

function cookie(token: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 12,
  };
}

async function credentials(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    return { email: (body.email || "").trim().toLowerCase(), password: body.password || "", form: false };
  }
  const data = await request.formData();
  return { email: String(data.get("email") || "").trim().toLowerCase(), password: String(data.get("password") || ""), form: true };
}

export async function POST(request: Request) {
  const { email, password, form } = await credentials(request);
  const bucket = attempts.get(email) ?? { n: 0, at: Date.now() };
  if (Date.now() - bucket.at > 10 * 60 * 1000) {
    bucket.n = 0;
    bucket.at = Date.now();
  }
  if (bucket.n >= 12) {
    if (form) return NextResponse.redirect(new URL("/login?error=rate", originOf(request)), 303);
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  }
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const match = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !match) {
    bucket.n += 1;
    attempts.set(email, bucket);
    if (form) return NextResponse.redirect(new URL("/login?error=credentials", originOf(request)), 303);
    return NextResponse.json({ error: "Email or password is wrong." }, { status: 401 });
  }
  attempts.delete(email);
  if (user.totpEnabled && user.totpSecret) {
    if (form) return NextResponse.redirect(new URL("/login?error=totp", originOf(request)), 303);
    const ticket = await signToken({ kind: "totp", uid: user.id, exp: Math.floor(Date.now() / 1000) + 300 });
    return NextResponse.json({ totpRequired: true, ticket });
  }
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 12 * 24 * 3600 * 1000) },
  });
  const token = await signToken({ kind: "session", sid: session.id, exp: Math.floor(session.expiresAt.getTime() / 1000) });
  await audit({ id: user.id, name: user.name }, "Signed in", { type: "session", id: session.id, label: user.email });
  const res = form ? NextResponse.redirect(new URL("/", originOf(request)), 303) : NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookie(token));
  return res;
}

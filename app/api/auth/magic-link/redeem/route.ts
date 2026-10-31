import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { redeemMagicLink } from "@/lib/magic-link";
import { magicLinkStore } from "@/lib/magic-link-store";
import { postLoginPath } from "@/lib/public-routing";
import { SESSION_COOKIE, signToken } from "@/lib/session-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const result = await redeemMagicLink({ token, store: magicLinkStore });
  const login = new URL("/login", appUrl());
  if (result.status !== 200) {
    login.searchParams.set("error", result.status === 404 ? "magic-off" : "magic");
    return NextResponse.redirect(login);
  }
  const user = await prisma.user.findUnique({ where: { email: result.email } });
  if (!user) {
    login.searchParams.set("error", "magic");
    return NextResponse.redirect(login);
  }
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 12 * 24 * 3600 * 1000) },
  });
  const sessionToken = await signToken({ kind: "session", sid: session.id, role: user.role, exp: Math.floor(session.expiresAt.getTime() / 1000) });
  await audit({ id: user.id, name: user.name }, "Signed in", { type: "session", id: session.id, label: user.email });
  const response = NextResponse.redirect(new URL(postLoginPath(user.role), appUrl()));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 12,
  });
  return response;
}

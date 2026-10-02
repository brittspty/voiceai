import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readToken, SESSION_COOKIE } from "@/lib/session-token";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  const payload = await readToken(token ? decodeURIComponent(token) : null);
  if (payload?.kind === "session") {
    await prisma.session.delete({ where: { id: payload.sid } }).catch(() => undefined);
  }
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const res = NextResponse.redirect(new URL("/login", `${proto}://${host}`), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

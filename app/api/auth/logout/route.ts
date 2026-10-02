import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readToken, SESSION_COOKIE } from "@/lib/session-token";

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  const payload = await readToken(token ? decodeURIComponent(token) : null);
  if (payload?.kind === "session") {
    await prisma.session.delete({ where: { id: payload.sid } }).catch(() => undefined);
  }
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

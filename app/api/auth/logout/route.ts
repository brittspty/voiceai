import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requestOrigin } from "@/lib/hosts";
import { readToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-token";

async function endSession(request: Request) {
  const token = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  const payload = await readToken(token ? decodeURIComponent(token) : null);
  if (payload?.kind === "session") {
    await prisma.session.delete({ where: { id: payload.sid } }).catch(() => undefined);
  }
  const res = NextResponse.redirect(new URL("/login", requestOrigin(request)), 303);
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}

export async function POST(request: Request) {
  return endSession(request);
}

export async function GET(request: Request) {
  return endSession(request);
}

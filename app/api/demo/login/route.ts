import { NextResponse } from "next/server";
import { DEMO_COOKIE, demoLoginAccepted, signDemoCookie } from "@/lib/demo/access";
import { ensureDemoVisitor } from "@/lib/demo/actions";
import { demoAccessSecret, demoWorkspaceEnabled } from "@/lib/demo/flags";
import { prisma } from "@/lib/db";
import { signToken, SESSION_COOKIE } from "@/lib/session-token";

function originOf(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  if (!demoWorkspaceEnabled()) return new NextResponse("Not found", { status: 404 });
  const data = await request.formData();
  const provided = String(data.get("secret") || "");
  if (!demoLoginAccepted(provided)) {
    return NextResponse.redirect(new URL("/demo/login?error=1", originOf(request)), 303);
  }
  const secret = demoAccessSecret();
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const response = NextResponse.redirect(new URL("/demo", originOf(request)), 303);
  response.cookies.set(DEMO_COOKIE, signDemoCookie(exp, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  try {
    const userId = await ensureDemoVisitor();
    const session = await prisma.session.create({ data: { userId, expiresAt: new Date(exp * 1000) } });
    const token = await signToken({ kind: "session", sid: session.id, role: "demo_viewer", exp });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
  } catch (error) {
    console.error("[demo] visitor session was not stored", error instanceof Error ? error.message : "failed");
  }
  return response;
}

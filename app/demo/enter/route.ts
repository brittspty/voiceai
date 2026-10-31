import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assessDemoGrant, DEMO_COOKIE, readDemoLinkToken, signDemoCookie } from "@/lib/demo/access";
import { demoAccessSecret, demoWorkspaceEnabled } from "@/lib/demo/flags";

export async function GET(request: Request) {
  if (!demoWorkspaceEnabled()) return new NextResponse("Not found", { status: 404 });
  const token = new URL(request.url).searchParams.get("token") || "";
  const secret = demoAccessSecret();
  const parsed = readDemoLinkToken(token, secret);
  const grant = parsed ? await prisma.demoGrant.findUnique({ where: { id: parsed.grantId } }) : null;
  if (assessDemoGrant(token, secret, grant) !== "ok") return new NextResponse("Not found", { status: 404 });
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const response = NextResponse.redirect(new URL("/demo", request.url), 303);
  response.cookies.set(DEMO_COOKIE, signDemoCookie(exp, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}

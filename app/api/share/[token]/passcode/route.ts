import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { checkSharePasscode, hashShareToken, passcodeCookieValue, SHARE_PASS_COOKIE, shareLinkState } from "@/lib/marketing/share-link";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const link = await prisma.clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) } });
  const state = shareLinkState(link, new Date());
  if (state !== "ok" || !link?.passcodeHash) {
    return NextResponse.redirect(new URL(`/share/${token}`, appUrl()), 303);
  }
  const form = await request.formData();
  const result = checkSharePasscode(link.id, String(form.get("code") || ""), link.passcodeHash);
  const back = new URL(`/share/${token}`, appUrl());
  if (!result.ok) {
    back.searchParams.set("code", result.locked ? "locked" : "wrong");
    return NextResponse.redirect(back, 303);
  }
  const response = NextResponse.redirect(new URL(`/share/${token}`, appUrl()), 303);
  response.cookies.set(SHARE_PASS_COOKIE, passcodeCookieValue(link.id, link.passcodeHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

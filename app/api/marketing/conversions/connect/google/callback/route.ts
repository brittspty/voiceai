import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sessionSecret } from "@/lib/env";
import { conversionAccess, renderConnectPopup } from "@/lib/marketing/offline/access";
import { OAUTH_STATE_COOKIE, oauthStateMatches } from "@/lib/marketing/offline/oauth-state";

function page(title: string, body: string, status: number) {
  const html = renderConnectPopup({ title, body, redirectUrl: null, asksForPassword: false });
  const response = new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/marketing/conversions/connect/google",
    maxAge: 0,
  });
  return response;
}

/** Checks the OAuth state cookie. Does not read, store, or log the authorization code. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = conversionAccess(user);
  if (!access.ok || !access.reconnectGoogle) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const queryState = new URL(request.url).searchParams.get("state") ?? "";
  const jar = await cookies();
  const cookie = jar.get(OAUTH_STATE_COOKIE)?.value ?? "";
  if (!oauthStateMatches(cookie, queryState, sessionSecret())) {
    return page(
      "Google sign-in",
      "Google sign-in could not be checked. Start again from Conversion feedback. VoiceOps never asks for your password.",
      400,
    );
  }
  return page(
    "Google sign-in",
    "Google sent you back. This dry run does not store a refresh token. Add it outside this page when you are ready to send. VoiceOps never asks for your password.",
    200,
  );
}

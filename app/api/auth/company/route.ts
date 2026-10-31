import { NextResponse } from "next/server";
import { appUrl, sessionSecret } from "@/lib/env";
import { googleOAuthStartUrl } from "@/lib/marketing/offline/access";
import { createOAuthState, OAUTH_STATE_COOKIE, OAUTH_STATE_MAX_AGE_MS } from "@/lib/marketing/offline/oauth-state";

export const dynamic = "force-dynamic";

/** Team sign-in uses the existing Google OAuth client. No other provider is added. */
export async function GET() {
  const state = createOAuthState(sessionSecret());
  const redirectUri = `${appUrl()}/api/marketing/conversions/connect/google/callback`;
  const target = googleOAuthStartUrl(process.env, redirectUri, state);
  if (!target) return NextResponse.redirect(new URL("/login?audience=team&error=company", appUrl()));
  const response = NextResponse.redirect(target);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/marketing/conversions/connect/google",
    maxAge: Math.floor(OAUTH_STATE_MAX_AGE_MS / 1000),
  });
  return response;
}

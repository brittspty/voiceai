import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/hosts";

export const dynamic = "force-dynamic";

/**
 * Company SSO is not connected.
 * Google Workspace OIDC, when someone adds it later, needs:
 * - OAuth client ID
 * - OAuth client secret
 * - Redirect URI https://jarvis.specificityinc.com/api/auth/oidc/callback
 * - Allowed domain specificityinc.com
 * Do not put those credentials on this server as part of this change.
 */
export async function GET(request: Request) {
  const login = new URL("/login", requestOrigin(request));
  login.searchParams.set("audience", "team");
  login.searchParams.set("error", "company");
  return NextResponse.redirect(login);
}

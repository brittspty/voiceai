import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { conversionAccess, renderConnectPopup } from "@/lib/marketing/offline/access";

/** Dry run does not store the OAuth code or a refresh token, and it does not log the query string. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = conversionAccess(user);
  if (!access.ok || !access.reconnectGoogle) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const html = renderConnectPopup({
    title: "Google sign-in",
    body: "Google sent you back. This dry run does not store a refresh token. Add it outside this page when you are ready to send. VoiceOps never asks for your password.",
    redirectUrl: null,
    asksForPassword: false,
  });
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

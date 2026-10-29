import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { conversionAccess, connectPageModel, renderConnectPopup } from "@/lib/marketing/offline/access";

export async function GET(_request: Request, context: { params: Promise<{ platform: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = conversionAccess(user);
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { platform } = await context.params;
  if (platform !== "meta" && platform !== "google") return NextResponse.json({ error: "Not allowed" }, { status: 404 });
  const redirectUri = `${appUrl()}/api/marketing/conversions/connect/google/callback`;
  const page = connectPageModel(platform, access, process.env, redirectUri);
  const html = renderConnectPopup(page);
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}

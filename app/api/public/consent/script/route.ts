import { NextResponse } from "next/server";
import { consentPopupEnabled } from "@/lib/consent/flags";
import { CONSENT_CHOICE_PATH, CONSENT_INSTALL_PATH, consentScriptSource } from "@/lib/consent/script";
import { clientKeyIssue, normalizePageUrl, pageUrlIssue } from "@/lib/consent/record";
import { recordConsentInstall, resolveConsentClient } from "@/lib/consent/store";

export const dynamic = "force-dynamic";

function originOf(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded || new URL(request.url).protocol.replace(":", "") || "https";
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  if (!consentPopupEnabled()) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const clientKey = new URL(request.url).searchParams.get("client")?.trim() || "";
  if (clientKeyIssue(clientKey)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const client = await resolveConsentClient(clientKey);
  if (!client) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const referer = request.headers.get("referer") || "";
  if (!pageUrlIssue(referer)) {
    await recordConsentInstall({
      workspaceId: client.workspaceId,
      clientKey: client.clientKey,
      pageUrl: normalizePageUrl(referer),
      kind: "detected",
    }).catch(() => undefined);
  }
  const origin = originOf(request);
  const source = consentScriptSource({
    clientKey: client.clientKey,
    choiceUrl: `${origin}${CONSENT_CHOICE_PATH}`,
    installUrl: `${origin}${CONSENT_INSTALL_PATH}`,
  });
  return new NextResponse(source, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

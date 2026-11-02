import { NextResponse } from "next/server";
import { clientIp, CONSENT_HEADERS, createConsentLimiter, handleConsentInstall } from "@/lib/consent/public";
import { recordConsentInstall, resolveConsentClient } from "@/lib/consent/store";

export const dynamic = "force-dynamic";

const limiter = createConsentLimiter();

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CONSENT_HEADERS });
}

export async function POST(request: Request) {
  const raw = await request.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const result = await handleConsentInstall({
    env: process.env,
    now: new Date(),
    ip: clientIp(request),
    body,
    limiter,
    resolveClient: resolveConsentClient,
  });
  if (result.install) {
    try {
      await recordConsentInstall(result.install);
    } catch {
      return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: CONSENT_HEADERS });
    }
  }
  if (result.status === 204) return new NextResponse(null, { status: 204, headers: result.headers });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

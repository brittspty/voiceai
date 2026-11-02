import { NextResponse } from "next/server";
import { clientIp, CONSENT_HEADERS, createConsentLimiter, handleConsentChoice } from "@/lib/consent/public";
import { resolveConsentClient, saveConsentRecord } from "@/lib/consent/store";

export const dynamic = "force-dynamic";

const limiter = createConsentLimiter();

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CONSENT_HEADERS });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 8000) {
    return NextResponse.json({ error: "Enter a consent choice." }, { status: 400, headers: CONSENT_HEADERS });
  }
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const result = await handleConsentChoice({
    env: process.env,
    now: new Date(),
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    body,
    limiter,
    resolveClient: resolveConsentClient,
  });
  if (result.record) {
    try {
      await saveConsentRecord(result.record);
    } catch {
      return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: CONSENT_HEADERS });
    }
  }
  if (result.status === 204) return new NextResponse(null, { status: 204, headers: result.headers });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

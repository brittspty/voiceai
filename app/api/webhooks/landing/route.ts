import { NextResponse } from "next/server";
import { decideLandingWrite, LANDING_SIGNATURE_HEADER, LANDING_WORKSPACE_HEADER } from "@/lib/marketing/landing-auth";
import { recordLanding, recordSpeedLead } from "@/lib/marketing/speed-to-lead-store";

const landingRateState = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const decision = decideLandingWrite({
    rawBody,
    workspaceId: request.headers.get(LANDING_WORKSPACE_HEADER),
    signature: request.headers.get(LANDING_SIGNATURE_HEADER),
    ip: clientIp(request),
    rateState: landingRateState,
  });
  if (decision.action === "reject") return NextResponse.json({ error: decision.error }, { status: decision.status });
  if (decision.action === "landing") {
    const stored = await recordLanding({ sessionKey: decision.sessionKey, landedAt: decision.landedAt });
    if (stored.status === "invalid") return NextResponse.json({ error: "Add a sessionKey" }, { status: 400 });
    return NextResponse.json({ status: stored.status });
  }
  const result = await recordSpeedLead({
    name: decision.name,
    phone: decision.phone,
    email: decision.email,
    sessionKey: decision.sessionKey,
    leadSource: decision.leadSource,
    landedAt: decision.landedAt,
    submittedAt: decision.submittedAt,
    callStartedAt: decision.callStartedAt,
    arrivalAt: decision.arrivalAt,
  });
  if (result.status === "invalid") return NextResponse.json({ error: "Add a sessionKey or phone" }, { status: 400 });
  return NextResponse.json({ status: result.status });
}

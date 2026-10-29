import { NextResponse } from "next/server";
import { speedToLeadEnabled } from "@/lib/marketing/config";
import { readLandingStamp } from "@/lib/marketing/speed-to-lead";
import { recordLanding, recordSpeedLead } from "@/lib/marketing/speed-to-lead-store";

export async function POST(request: Request) {
  if (!speedToLeadEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const text = await request.text();
  if (text.length > 4000) return NextResponse.json({ error: "Payload is too large" }, { status: 413 });
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Send JSON" }, { status: 400 });
  }
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const landing = readLandingStamp(body);
  const phone = typeof root.phone === "string" ? root.phone : "";
  const email = typeof root.email === "string" ? root.email : "";
  const name = typeof root.name === "string" ? root.name : "";
  const kind = typeof root.kind === "string" ? root.kind : "landing";
  if (kind === "call" || kind === "form") {
    const result = await recordSpeedLead({
      name,
      phone,
      email,
      sessionKey: landing.sessionKey,
      leadSource: landing.leadSource || (kind === "call" ? "Call" : "Form"),
      landedAt: landing.landedAt,
      submittedAt: kind === "form" ? (root.submittedAt ?? new Date().toISOString()) : undefined,
      callStartedAt: kind === "call" ? (root.callStartedAt ?? root.startedAt ?? new Date().toISOString()) : undefined,
    });
    if (result.status === "invalid") return NextResponse.json({ error: "Add a sessionKey or phone" }, { status: 400 });
    return NextResponse.json(result);
  }
  const stored = await recordLanding({
    sessionKey: landing.sessionKey,
    phone,
    email,
    landedAt: landing.landedAt ?? new Date().toISOString(),
  });
  if (stored.status === "invalid") return NextResponse.json({ error: "Add a sessionKey or phone" }, { status: 400 });
  return NextResponse.json(stored);
}

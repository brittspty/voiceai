import { NextResponse } from "next/server";
import { integrationsMode } from "@/lib/env";
import { verifySignature } from "@/lib/webhook-parse";
import { acceptOrQueue } from "@/lib/webhook-apply";

async function payload(request: Request) {
  const text = await request.text();
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/x-www-form-urlencoded")) {
    return { text, body: Object.fromEntries(new URLSearchParams(text)) };
  }
  return { text, body: JSON.parse(text || "{}") };
}

export async function POST(request: Request) {
  const { text, body } = await payload(request);
  const secret = process.env.TWILIO_WEBHOOK_SECRET || process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-voiceops-signature");
  const shared = request.headers.get("x-webhook-secret");
  const allowed = (secret && shared === secret) || verifySignature(secret, text, signature, integrationsMode());
  if (!allowed) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const result = await acceptOrQueue("twilio", body);
  return NextResponse.json(result);
}

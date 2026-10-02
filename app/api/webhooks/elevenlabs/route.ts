import { NextResponse } from "next/server";
import { integrationsMode } from "@/lib/env";
import { verifySignature } from "@/lib/webhook-parse";
import { acceptOrQueue } from "@/lib/webhook-apply";

export async function POST(request: Request) {
  const text = await request.text();
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const signature = request.headers.get("x-voiceops-signature");
  const shared = request.headers.get("x-webhook-secret");
  const allowed = (secret && shared === secret) || verifySignature(secret, text, signature, integrationsMode());
  if (!allowed) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const body = JSON.parse(text || "{}");
  const result = await acceptOrQueue("elevenlabs", body);
  return NextResponse.json(result);
}

import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { clientConfig } from "@/lib/client-config";
import { prisma } from "@/lib/db";
import { appUrl, integrationsMode } from "@/lib/env";
import { enqueue } from "@/lib/queue";
import { handleTwilioWebhook } from "@/lib/twilio";
import { SYSTEM_ACTOR } from "@/lib/types";
import { applyTwilioEvent, logInboundTwilioCall } from "@/lib/webhook-apply";
import { parseTwilio } from "@/lib/webhook-parse";

export async function POST(request: Request) {
  let testMode = true;
  let companyName = clientConfig().companyName;
  try {
    const org = await prisma.org.findUnique({ where: { id: "org" } });
    if (org) {
      testMode = org.testMode;
      companyName = org.name || companyName;
    }
  } catch {
    testMode = true;
  }
  return handleTwilioWebhook(request, {
    mode: integrationsMode(),
    authToken: process.env.TWILIO_AUTH_TOKEN,
    webhookSecret: process.env.TWILIO_WEBHOOK_SECRET,
    appUrl: appUrl(),
    agentId: process.env.ELEVENLABS_AGENT_ID,
    elevenKey: process.env.ELEVENLABS_API_KEY,
    testMode,
    companyName,
    applyStatus: async (body) => {
      const event = parseTwilio(body);
      if (!event) return { ok: true, ignored: true };
      return applyTwilioEvent(event);
    },
    logInbound: (params) => logInboundTwilioCall(params),
    onError: async (error, body) => {
      await enqueue({
        type: "inbound_event",
        payload: { source: "twilio", body: body as Prisma.InputJsonValue },
      });
      await audit(SYSTEM_ACTOR, "Queued an incoming event after it failed", {
        type: "webhook",
        label: error instanceof Error ? error.message : "twilio",
      });
    },
  });
}

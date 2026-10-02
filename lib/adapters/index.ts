import { integrationsMode } from "../env";
import { buildTranscript } from "../transcript";
import type { CallOutcomeName } from "../types";
import type { CrmPort, CrmWriteInput, VoicePlaceInput, VoicePlaceResult, VoicePort } from "../pipeline";

function mockOutcome(input: VoicePlaceInput): CallOutcomeName {
  if (input.simulatedOutcome) return input.simulatedOutcome;
  if (input.to.endsWith("0000")) return "failed";
  return "callback_requested";
}

export const mockVoice: VoicePort = {
  async placeCall(input) {
    const outcome = mockOutcome(input);
    const failed = outcome === "failed" || outcome === "no_answer";
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const result: VoicePlaceResult = {
      conversationId: `conv_mock_${id}`,
      callSid: `CA_mock_${id}`,
      outcome,
      durationSec: failed ? 0 : 42 + (input.to.charCodeAt(input.to.length - 1) % 20),
      costCents: failed ? 0 : 14,
      transcript: buildTranscript(input.agentName, input.contactName || input.to, outcome, input.companyName),
    };
    return result;
  },
};

export const mockCrm: CrmPort = {
  async writeOutcome(input: CrmWriteInput) {
    if (input.forceFail) throw new Error("GoHighLevel did not accept the update (mock failure)");
    return { externalId: `ghl_note_${input.phone.slice(-4)}_${input.outcome}` };
  },
};

async function ghlFetch(path: string, init?: RequestInit) {
  const key = process.env.GHL_API_KEY;
  if (!key) throw new Error("GHL_API_KEY is not set");
  const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GoHighLevel ${res.status}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : {};
}

export const liveCrm: CrmPort = {
  async writeOutcome(input) {
    const locationId = process.env.GHL_LOCATION_ID;
    if (!locationId) throw new Error("GHL_LOCATION_ID is not set");
    let contactId = input.ghlContactId ?? null;
    if (!contactId) {
      const created = await ghlFetch("/contacts/", {
        method: "POST",
        body: JSON.stringify({
          locationId,
          phone: input.phone,
          name: input.contactName,
          source: "Voice Operations",
        }),
      });
      contactId = created?.contact?.id || created?.id;
    }
    if (!contactId) throw new Error("GoHighLevel did not return a contact id");
    const note = await ghlFetch(`/contacts/${contactId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: input.summary }),
    });
    await ghlFetch(`/contacts/${contactId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: [`voiceops-${input.outcome.replaceAll("_", "-")}`] }),
    });
    return { externalId: String(note?.note?.id || note?.id || contactId) };
  },
};

export const liveVoice: VoicePort = {
  async placeCall(input) {
    const key = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const phoneNumberId = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
    if (!key || !agentId || !phoneNumberId) {
      throw new Error("ElevenLabs agent, API key, or phone number id is not set");
    }
    const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: input.to,
        conversation_initiation_client_data: {
          conversation_config_override: {
            agent: { first_message: input.openingLine },
          },
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 240)}`);
    const json = text ? JSON.parse(text) : {};
    return {
      conversationId: String(json.conversation_id || json.conversationId || ""),
      callSid: String(json.callSid || json.call_sid || ""),
      outcome: "callback_requested",
      durationSec: 0,
      costCents: 0,
      transcript: [],
    };
  },
};

export function getPorts(testMode: boolean): { voice: VoicePort; crm: CrmPort; mocked: boolean } {
  const mocked = integrationsMode() !== "live" || testMode;
  return mocked ? { voice: mockVoice, crm: mockCrm, mocked: true } : { voice: liveVoice, crm: liveCrm, mocked: false };
}

export async function checkGhl(): Promise<{ status: "healthy" | "down" | "unconfigured"; latencyMs: number | null; detail: string }> {
  if (integrationsMode() !== "live") {
    return { status: "healthy", latencyMs: 1390, detail: "Lead sync" };
  }
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    return { status: "unconfigured", latencyMs: null, detail: "Missing API key or location id" };
  }
  const started = Date.now();
  try {
    await ghlFetch(`/locations/${process.env.GHL_LOCATION_ID}`);
    return { status: "healthy", latencyMs: Date.now() - started, detail: "Lead sync" };
  } catch (error) {
    return { status: "down", latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : "Check failed" };
  }
}

export async function checkEleven(): Promise<{ status: "healthy" | "down" | "unconfigured"; latencyMs: number | null; detail: string }> {
  if (integrationsMode() !== "live") return { status: "healthy", latencyMs: 240, detail: "Conversational AI" };
  if (!process.env.ELEVENLABS_API_KEY) return { status: "unconfigured", latencyMs: null, detail: "Missing API key" };
  const started = Date.now();
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
    return { status: "healthy", latencyMs: Date.now() - started, detail: "Conversational AI" };
  } catch (error) {
    return { status: "down", latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : "Check failed" };
  }
}

export async function checkTwilio(): Promise<{ status: "healthy" | "down" | "unconfigured"; latencyMs: number | null; detail: string }> {
  if (integrationsMode() !== "live") return { status: "healthy", latencyMs: 180, detail: "Phone carrier" };
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !process.env.TWILIO_PHONE_NUMBER) {
    return { status: "unconfigured", latencyMs: null, detail: "Missing SID, token, or number" };
  }
  const started = Date.now();
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
    return { status: "healthy", latencyMs: Date.now() - started, detail: "Phone carrier" };
  } catch (error) {
    return { status: "down", latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : "Check failed" };
  }
}

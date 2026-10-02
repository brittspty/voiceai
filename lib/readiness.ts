export type ReadinessInput = {
  testMode: boolean;
  scheduleEnabled: boolean;
  integrationsMode: "mock" | "live";
  hasGhlKey: boolean;
  hasGhlLocation: boolean;
  hasElevenKey: boolean;
  hasElevenAgent: boolean;
  hasTwilioSid: boolean;
  hasTwilioToken: boolean;
  hasTwilioNumber: boolean;
  agentPublished: boolean;
  voicePublished: boolean;
  rulesPublished: boolean;
  requireConsent: boolean;
  enforceDnc: boolean;
  enforceHours: boolean;
  liveKnowledge: boolean;
  officeReady: boolean;
  anyTotp: boolean;
  webhookSecrets: boolean;
};

export type ReadinessItem = { id: string; label: string; ok: boolean; hint: string };

export function readinessItems(input: ReadinessInput): ReadinessItem[] {
  return [
    {
      id: "test-mode",
      label: "Test mode is off",
      ok: !input.testMode,
      hint: "Turn test mode off only when you mean to dial real people.",
    },
    {
      id: "mode",
      label: "Integrations are set to live",
      ok: input.integrationsMode === "live",
      hint: "Set INTEGRATIONS_MODE=live on the app and the worker.",
    },
    {
      id: "schedule",
      label: "Schedule is on for a small pilot",
      ok: input.scheduleEnabled,
      hint: "New GoHighLevel leads are dialed only while the schedule is on.",
    },
    {
      id: "ghl",
      label: "GoHighLevel API key and location are set",
      ok: input.hasGhlKey && input.hasGhlLocation,
      hint: "GHL_API_KEY and GHL_LOCATION_ID.",
    },
    {
      id: "eleven",
      label: "ElevenLabs key and agent id are set",
      ok: input.hasElevenKey && input.hasElevenAgent,
      hint: "Obtain a fresh ElevenLabs key privately. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.",
    },
    {
      id: "twilio",
      label: "Twilio SID, token, and number are set",
      ok: input.hasTwilioSid && input.hasTwilioToken && input.hasTwilioNumber,
      hint: "Rotate the Twilio auth token before go-live. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
    },
    {
      id: "agent",
      label: "Agent instructions are published",
      ok: input.agentPublished,
      hint: "An owner publishes the script the voice agent will speak.",
    },
    {
      id: "voice",
      label: "A voice is live",
      ok: input.voicePublished,
      hint: "Choose a voice and make it live.",
    },
    {
      id: "rules",
      label: "Calling rules are published",
      ok: input.rulesPublished,
      hint: "Hours, caps, and retries come from the published rules.",
    },
    {
      id: "consent",
      label: "Calls without consent are blocked",
      ok: input.requireConsent,
      hint: "Leave the consent gate on.",
    },
    {
      id: "dnc",
      label: "Do-not-call is enforced",
      ok: input.enforceDnc,
      hint: "Leave the do-not-call gate on.",
    },
    {
      id: "hours",
      label: "Calling hours are enforced",
      ok: input.enforceHours,
      hint: "Calls stay inside the lead's local window.",
    },
    {
      id: "knowledge",
      label: "A knowledge document is live",
      ok: input.liveKnowledge,
      hint: "Publish at least one document the agent can answer from.",
    },
    {
      id: "office",
      label: "An active office has a timezone and calendar",
      ok: input.officeReady,
      hint: "Routing needs an office, a timezone, and a calendar name.",
    },
    {
      id: "totp",
      label: "An owner or admin uses two-step sign-in",
      ok: input.anyTotp,
      hint: "Turn on two-step sign-in before a pilot.",
    },
    {
      id: "webhooks",
      label: "Webhook secrets are set",
      ok: input.webhookSecrets,
      hint: "GHL_WEBHOOK_SECRET, ELEVENLABS_WEBHOOK_SECRET, and TWILIO_AUTH_TOKEN.",
    },
  ];
}

import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient, type CallOutcome, type Consent, type Prisma } from "@prisma/client";
import { clientConfig, defaultKnowledge } from "../lib/client-config";
import { plannedSeedUsers, SAMPLE_ACTIVITY_ACTIONS, seedStartupLines } from "../lib/seed-plan";
import { zonedTimeToUtc } from "../lib/time";
import { buildTranscript } from "../lib/transcript";
import { DEFAULT_POLICY } from "../lib/types";

const prisma = new PrismaClient();

const passed = [
  { id: "consent", label: "Consent", passed: true, detail: "Consent is high, which meets the low minimum." },
  { id: "dnc", label: "Do-not-call", passed: true, detail: "This number is not on the do-not-call list." },
  { id: "hours", label: "Calling hours", passed: true, detail: "Local time was inside the calling window." },
  { id: "daily_cap", label: "Daily cap", passed: true, detail: "Under the daily cap." },
  { id: "attempts", label: "Retry limit", passed: true, detail: "Attempts remaining." },
];

function knowledgeBody(cfg: ReturnType<typeof clientConfig>) {
  if (!cfg.knowledgePath) {
    return defaultKnowledge({
      companyName: cfg.companyName,
      agentName: cfg.agentName,
      timezone: cfg.timezone,
      offices: cfg.offices,
    });
  }
  try {
    return readFileSync(cfg.knowledgePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not read file";
    throw new Error(`SEED_KNOWLEDGE_PATH (${cfg.knowledgePath}) ${message}`);
  }
}

async function main() {
  const existing = await prisma.org.findUnique({ where: { id: "org" } });
  if (existing) {
    console.log("Seed already applied. Workspace values stay as they are in the database.");
    return;
  }

  const cfg = clientConfig();
  const wall = (value: string) => zonedTimeToUtc(value, cfg.timezone);
  const openingLine = `Hi, this is ${cfg.agentName} with ${cfg.companyName}. I'm calling to help you set a short time. Is now okay?`;
  const instructions = `You are ${cfg.agentName}, the voice agent for ${cfg.companyName}. Confirm the person, offer one appointment, and stop if they decline or if consent is unclear. Never collect government IDs, account numbers, or card numbers. If they want a callback, say so and end the call.`;

  await prisma.org.create({
    data: {
      id: "org",
      name: cfg.companyName,
      subtitle: cfg.subtitle,
      agentName: cfg.agentName,
      timezone: cfg.timezone,
      brandColor: cfg.brandColor,
      logoUrl: cfg.logoUrl,
      mark: cfg.mark,
      testMode: true,
      scheduleEnabled: false,
    },
  });

  await prisma.user.createMany({
    data: await Promise.all(
      plannedSeedUsers(cfg).map(async (user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: await bcrypt.hash(user.password, 10),
        role: user.role,
        totpEnabled: user.totpEnabled,
        totpSecret: user.totpSecret,
      })),
    ),
  });

  const offices = [];
  for (const office of cfg.offices) {
    offices.push(
      await prisma.office.create({
        data: {
          name: office.name,
          timezone: office.timezone,
          type: office.type,
          status: "active",
          calendarName: `${cfg.agentName} · ${office.name}`,
          syncedAt: new Date(),
          advisors: { create: [{ name: cfg.agentName }] },
          hours: { create: weekHours() },
        },
      }),
    );
  }
  const sampleOffice = offices.find((office) => office.type === "virtual") ?? offices[0];

  await prisma.callingRulesVersion.create({
    data: {
      version: 1,
      status: "published",
      config: DEFAULT_POLICY,
      authorId: "user_owner",
      authorName: cfg.owner.name,
      publishedAt: wall("2026-09-20T09:00:00"),
      createdAt: wall("2026-09-20T09:00:00"),
    },
  });

  await prisma.agentVersion.create({
    data: {
      version: 1,
      status: "draft",
      agentName: cfg.agentName,
      openingLine,
      instructions,
      authorId: "user_owner",
      authorName: cfg.owner.name,
      createdAt: wall("2026-09-24T15:00:00"),
    },
  });

  const knowledge = await prisma.knowledgeDoc.create({
    data: {
      title: cfg.knowledgeTitle,
      body: knowledgeBody(cfg),
      status: "live",
      publishedAt: new Date(Date.now() - 8 * 86400000),
      createdAt: new Date(Date.now() - 8 * 86400000),
      updatedAt: new Date(Date.now() - 8 * 86400000),
    },
  });

  await prisma.fieldMapping.createMany({
    data: [
      { internalField: "Phone", ghlField: "phone", direction: "both" },
      { internalField: "Email", ghlField: "email", direction: "both" },
      { internalField: "Name", ghlField: "contact.name", direction: "read" },
      { internalField: "Outcome", ghlField: "custom.voice_outcome", direction: "write" },
      { internalField: "Consent", ghlField: "custom.consent", direction: "read" },
      { internalField: "Tags", ghlField: "tags", direction: "both" },
    ],
  });

  const live = process.env.INTEGRATIONS_MODE === "live";
  await prisma.integrationCheck.createMany({
    data: [
      integrationRow("ghl", "GoHighLevel", "Lead sync", !live || Boolean(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID), 1390),
      integrationRow("elevenlabs", "ElevenLabs", "Conversational AI", !live || Boolean(process.env.ELEVENLABS_API_KEY), 240),
      integrationRow("twilio", "Twilio", "Phone carrier", !live || Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER), 180),
    ],
  });

  if (cfg.sampleData && sampleOffice) {
    await seedSample(cfg, sampleOffice.id, wall);
  }

  await prisma.activity.create({
    data: {
      actorId: "user_owner",
      actorName: cfg.owner.name,
      action: "Seeded the workspace",
      targetType: "org",
      targetLabel: cfg.companyName,
      createdAt: new Date(),
    },
  });
  if (cfg.sampleData) {
    const [rules, office, knowledgeAction] = SAMPLE_ACTIVITY_ACTIONS;
    await prisma.activity.createMany({
      data: [
        { actorId: "user_owner", actorName: cfg.owner.name, action: rules, targetType: "calling_rules", targetLabel: "v1", createdAt: wall("2026-09-20T09:00:00") },
        { actorId: "user_owner", actorName: cfg.owner.name, action: office, targetType: "office", targetLabel: sampleOffice?.name || "Office", createdAt: wall("2026-09-18T11:20:00") },
        { actorId: "user_owner", actorName: cfg.owner.name, action: knowledgeAction, targetType: "knowledge", targetId: knowledge.id, targetLabel: knowledge.title, createdAt: new Date(Date.now() - 8 * 86400000) },
      ],
    });
  }

  for (const line of seedStartupLines(cfg)) console.log(line);
}

function integrationRow(provider: string, label: string, detail: string, configured: boolean, mockLatency: number) {
  const live = process.env.INTEGRATIONS_MODE === "live";
  if (!live) return { provider, label, detail, status: "healthy" as const, latencyMs: mockLatency, checkedAt: new Date(Date.now() - 12 * 60 * 1000) };
  if (!configured) return { provider, label, detail: "Not configured", status: "unconfigured" as const, latencyMs: null, checkedAt: new Date() };
  return { provider, label, detail: "Not checked yet", status: "unconfigured" as const, latencyMs: null, checkedAt: new Date() };
}

async function seedSample(cfg: ReturnType<typeof clientConfig>, officeId: string, wall: (value: string) => Date) {
  const contacts: { id: string; name: string; phone: string; consent: Consent; at: string }[] = [
    { id: "ct_unknown", name: "Unknown", phone: "+19195558330", consent: "none", at: "2026-09-30T00:24:00" },
    { id: "ct_3092", name: "Test call +19199093092", phone: "+19199093092", consent: "high", at: "2026-09-25T11:09:00" },
    { id: "ct_3259", name: "Test call +13304023259", phone: "+13304023259", consent: "high", at: "2026-09-24T09:51:00" },
    { id: "ct_sample_1", name: "Sample lead", phone: "+13304023259", consent: "high", at: "2026-09-09T12:03:00" },
    { id: "ct_1926", name: "Test call +447771881926", phone: "+447771881926", consent: "high", at: "2026-09-08T10:11:00" },
    { id: "ct_8466", name: "Test call +1919501288466", phone: "+1919501288466", consent: "high", at: "2026-09-06T18:28:00" },
    { id: "ct_4464a", name: "Test call +1918533884464", phone: "+1918533884464", consent: "high", at: "2026-09-06T18:26:00" },
    { id: "ct_4464b", name: "Test call +1918533884464", phone: "+1918533884464", consent: "high", at: "2026-09-06T18:25:00" },
    { id: "ct_7047a", name: "Test call +1919004907047", phone: "+1919004907047", consent: "high", at: "2026-09-06T07:04:00" },
    { id: "ct_7047b", name: "Test call +1919004907047", phone: "+1919004907047", consent: "high", at: "2026-09-06T07:04:00" },
    { id: "ct_sample_2", name: "Sample lead 2", phone: "+1919501288466", consent: "high", at: "2026-09-04T18:24:00" },
    { id: "ct_sample_3", name: "Sample lead 3", phone: "+1919501288466", consent: "high", at: "2026-09-04T09:34:00" },
  ];

  for (const contact of contacts) {
    await prisma.contact.create({
      data: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        officeId: contact.id === "ct_unknown" ? null : officeId,
        consent: contact.consent,
        consentAt: contact.consent === "none" ? null : wall(contact.at),
        source: contact.name.startsWith("Test call") ? "Test console" : contact.id === "ct_unknown" ? "Inbound" : "Sample",
        timezone: cfg.timezone,
        createdAt: wall(contact.at),
      },
    });
  }

  const calls: {
    id: string;
    contactId: string;
    at: string;
    duration: number;
    outcome: CallOutcome;
    status: "completed" | "failed";
    direction?: "inbound" | "outbound";
    office?: string | null;
  }[] = [
    { id: "call_8330", contactId: "ct_unknown", at: "2026-09-30T00:24:00", duration: 53, outcome: "callback_requested", status: "completed", direction: "inbound", office: null },
    { id: "call_3092", contactId: "ct_3092", at: "2026-09-25T11:09:00", duration: 48, outcome: "callback_requested", status: "completed" },
    { id: "call_3259", contactId: "ct_3259", at: "2026-09-24T09:51:00", duration: 54, outcome: "callback_requested", status: "completed" },
    { id: "call_sample_1", contactId: "ct_sample_1", at: "2026-09-09T12:03:00", duration: 63, outcome: "callback_requested", status: "completed" },
    { id: "call_1926", contactId: "ct_1926", at: "2026-09-08T10:11:00", duration: 26, outcome: "callback_requested", status: "completed" },
    { id: "call_7047_pm", contactId: "ct_7047a", at: "2026-09-06T22:32:00", duration: 0, outcome: "failed", status: "failed" },
    { id: "call_8466", contactId: "ct_8466", at: "2026-09-06T18:28:00", duration: 131, outcome: "callback_requested", status: "completed" },
    { id: "call_4464a", contactId: "ct_4464a", at: "2026-09-06T18:26:00", duration: 40, outcome: "callback_requested", status: "completed" },
    { id: "call_4464b", contactId: "ct_4464b", at: "2026-09-06T18:25:00", duration: 13, outcome: "callback_requested", status: "completed" },
    { id: "call_7047_ok", contactId: "ct_7047b", at: "2026-09-06T07:04:00", duration: 144, outcome: "callback_requested", status: "completed" },
    { id: "call_7047_am", contactId: "ct_7047a", at: "2026-09-06T07:04:00", duration: 0, outcome: "failed", status: "failed" },
    { id: "call_sample_2", contactId: "ct_sample_2", at: "2026-09-04T22:39:00", duration: 302, outcome: "callback_requested", status: "completed" },
    { id: "call_sample_3", contactId: "ct_sample_3", at: "2026-09-04T09:34:00", duration: 109, outcome: "callback_requested", status: "completed" },
  ];

  for (const call of calls) {
    const contact = contacts.find((item) => item.id === call.contactId)!;
    const when = wall(call.at);
    const transcript = buildTranscript(cfg.agentName, contact.name, call.outcome, cfg.companyName);
    const timeline = [
      { at: when.toISOString(), label: call.direction === "inbound" ? "Call came in" : "Gates passed" },
      { at: new Date(when.getTime() + 1000).toISOString(), label: call.status === "failed" ? "Carrier failed" : "Call finished", detail: call.outcome.replaceAll("_", " ") },
    ];
    await prisma.call.create({
      data: {
        id: call.id,
        contactId: call.contactId,
        officeId: call.office === null ? null : officeId,
        status: call.status,
        outcome: call.outcome,
        direction: call.direction ?? "outbound",
        startedAt: when,
        endedAt: new Date(when.getTime() + call.duration * 1000),
        durationSec: call.duration,
        costCents: call.duration === 0 ? 0 : Math.max(8, Math.round(call.duration * 0.28)),
        consent: contact.consent,
        isTest: contact.name.startsWith("Test call"),
        transcript,
        timeline,
        gateChecks: passed,
        recordingUrl: `/api/calls/${call.id}/recording`,
        elevenLabsConversationId: `conv_${call.id}`,
        twilioCallSid: `CA_${call.id}`,
        failureReason: call.status === "failed" ? "The carrier returned a failed status before the conversation started." : null,
        gatesPassed: true,
        triggeredAt: when,
        dialedAt: when,
        connected: call.status === "completed" && call.duration > 0,
        booked: false,
        createdAt: when,
      },
    });
  }

  const queuedAt = new Date();
  await prisma.call.createMany({
    data: [
      {
        id: "call_q_7047",
        contactId: "ct_7047a",
        officeId,
        status: "queued",
        consent: "high",
        isTest: true,
        direction: "outbound",
        triggeredAt: wall("2026-09-30T12:00:00"),
        createdAt: queuedAt,
        timeline: [{ at: queuedAt.toISOString(), label: "Waiting for a dialing slot" }] as Prisma.InputJsonValue,
      },
      {
        id: "call_q_sample",
        contactId: "ct_sample_2",
        officeId,
        status: "queued",
        consent: "high",
        isTest: false,
        direction: "outbound",
        triggeredAt: wall("2026-09-30T12:05:00"),
        createdAt: new Date(queuedAt.getTime() - 1000),
        timeline: [{ at: queuedAt.toISOString(), label: "Waiting for a dialing slot" }] as Prisma.InputJsonValue,
      },
    ],
  });

  const tags = [
    ["new lead", 12],
    ["callback requested", 8],
    ["booked", 3],
  ] as const;
  for (const [name, contactCount] of tags) {
    await prisma.tag.create({ data: { name, contactCount, source: "sample" } });
  }

  await prisma.job.create({
    data: {
      id: "job_failed_ghl",
      type: "inbound_event",
      status: "failed",
      attempts: 3,
      maxAttempts: 3,
      lastError: "GoHighLevel webhook timed out after 3 attempts.",
      payload: { source: "ghl", event: "ContactCreate" },
      runAt: wall("2026-09-28T16:10:00"),
      finishedAt: wall("2026-09-28T16:40:00"),
      createdAt: wall("2026-09-28T16:10:00"),
    },
  });
}

function weekHours() {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    closed: weekday !== 5,
    openTime: "10:00",
    closeTime: "17:00",
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

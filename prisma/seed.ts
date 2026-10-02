import bcrypt from "bcryptjs";
import { PrismaClient, type CallOutcome, type Consent, type Prisma } from "@prisma/client";
import { KNOWLEDGE_BODY } from "./kb";
import { zonedTimeToUtc } from "../lib/time";
import { buildTranscript } from "../lib/transcript";
import { DEFAULT_POLICY } from "../lib/types";

const prisma = new PrismaClient();
const tz = "America/New_York";
const wall = (value: string) => zonedTimeToUtc(value, tz);

const passed = [
  { id: "consent", label: "Consent", passed: true, detail: "Consent is high, which meets the low minimum." },
  { id: "dnc", label: "Do-not-call", passed: true, detail: "This number is not on the do-not-call list." },
  { id: "hours", label: "Calling hours", passed: true, detail: "Local time was inside the calling window." },
  { id: "daily_cap", label: "Daily cap", passed: true, detail: "Under the daily cap." },
  { id: "attempts", label: "Retry limit", passed: true, detail: "Attempts remaining." },
];

async function main() {
  const existing = await prisma.org.findUnique({ where: { id: "org" } });
  if (existing) {
    console.log("Seed already applied.");
    return;
  }

  const ownerPassword = process.env.SEED_OWNER_PASSWORD || "VoiceOps!owner";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "VoiceOps!admin";
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD || "VoiceOps!viewer";

  await prisma.org.create({
    data: {
      id: "org",
      name: "Capital Financial",
      subtitle: "Voice Ops",
      agentName: "Karen",
      timezone: tz,
      testMode: true,
      scheduleEnabled: false,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        id: "user_owner",
        name: "Alex Rivera",
        email: "alex.rivera@capitalfinancial.example",
        passwordHash: await bcrypt.hash(ownerPassword, 10),
        role: "owner",
      },
      {
        id: "user_admin",
        name: "Jordan Lee",
        email: "jordan.lee@capitalfinancial.example",
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "admin",
        totpEnabled: true,
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
      {
        id: "user_viewer",
        name: "Sam Patel",
        email: "sam.patel@capitalfinancial.example",
        passwordHash: await bcrypt.hash(viewerPassword, 10),
        role: "viewer",
      },
    ],
  });

  await prisma.office.create({
    data: {
      id: "office_default",
      name: "Default office",
      timezone: tz,
      type: "office",
      status: "active",
      calendarName: "Karen Capital Financial",
      ghlCalendarId: "cal_sample_default",
      syncedAt: new Date(),
      advisors: { create: [{ name: "Karen", email: "karen@capitalfinancial.example" }] },
      hours: { create: weekHours() },
    },
  });
  await prisma.office.create({
    data: {
      id: "office_virtual",
      name: "Virtual",
      timezone: tz,
      type: "virtual",
      status: "active",
      calendarName: "Virtual",
      ghlCalendarId: "cal_sample_virtual",
      syncedAt: new Date(),
      advisors: { create: [{ name: "Karen" }] },
      hours: { create: weekHours() },
    },
  });

  const contacts: { id: string; name: string; phone: string; consent: Consent; at: string; email?: string }[] = [
    { id: "ct_unknown", name: "Unknown", phone: "+19195558330", consent: "none", at: "2026-09-30T00:24:00" },
    { id: "ct_3092", name: "Test call +19199093092", phone: "+19199093092", consent: "high", at: "2026-09-25T11:09:00" },
    { id: "ct_3259", name: "Test call +13304023259", phone: "+13304023259", consent: "high", at: "2026-09-24T09:51:00" },
    { id: "ct_brittany", name: "Brittany +13304023259", phone: "+13304023259", consent: "high", at: "2026-09-09T12:03:00" },
    { id: "ct_1926", name: "Test call +447771881926", phone: "+447771881926", consent: "high", at: "2026-09-08T10:11:00" },
    { id: "ct_8466", name: "Test call +1919501288466", phone: "+1919501288466", consent: "high", at: "2026-09-06T18:28:00" },
    { id: "ct_4464a", name: "Test call +1918533884464", phone: "+1918533884464", consent: "high", at: "2026-09-06T18:26:00" },
    { id: "ct_4464b", name: "Test call +1918533884464", phone: "+1918533884464", consent: "high", at: "2026-09-06T18:25:00" },
    { id: "ct_7047a", name: "Test call +1919004907047", phone: "+1919004907047", consent: "high", at: "2026-09-06T07:04:00" },
    { id: "ct_7047b", name: "Test call +1919004907047", phone: "+1919004907047", consent: "high", at: "2026-09-06T07:04:00" },
    { id: "ct_eva", name: "EVA +1919501288466", phone: "+1919501288466", consent: "high", at: "2026-09-04T18:24:00" },
    { id: "ct_parik", name: "Parik +1919501288466", phone: "+1919501288466", consent: "high", at: "2026-09-04T09:34:00" },
  ];

  for (const contact of contacts) {
    await prisma.contact.create({
      data: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        officeId: contact.id === "ct_unknown" ? null : "office_virtual",
        consent: contact.consent,
        consentAt: contact.consent === "none" ? null : wall(contact.at),
        source: contact.name.startsWith("Test call") ? "Test console" : contact.id === "ct_unknown" ? "Inbound" : "GoHighLevel",
        timezone: tz,
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
    { id: "call_brittany", contactId: "ct_brittany", at: "2026-09-09T12:03:00", duration: 63, outcome: "callback_requested", status: "completed" },
    { id: "call_1926", contactId: "ct_1926", at: "2026-09-08T10:11:00", duration: 26, outcome: "callback_requested", status: "completed" },
    { id: "call_7047_pm", contactId: "ct_7047a", at: "2026-09-06T22:32:00", duration: 0, outcome: "failed", status: "failed" },
    { id: "call_8466", contactId: "ct_8466", at: "2026-09-06T18:28:00", duration: 131, outcome: "callback_requested", status: "completed" },
    { id: "call_4464a", contactId: "ct_4464a", at: "2026-09-06T18:26:00", duration: 40, outcome: "callback_requested", status: "completed" },
    { id: "call_4464b", contactId: "ct_4464b", at: "2026-09-06T18:25:00", duration: 13, outcome: "callback_requested", status: "completed" },
    { id: "call_7047_ok", contactId: "ct_7047b", at: "2026-09-06T07:04:00", duration: 144, outcome: "callback_requested", status: "completed" },
    { id: "call_7047_am", contactId: "ct_7047a", at: "2026-09-06T07:04:00", duration: 0, outcome: "failed", status: "failed" },
    { id: "call_eva", contactId: "ct_eva", at: "2026-09-04T22:39:00", duration: 302, outcome: "callback_requested", status: "completed" },
    { id: "call_parik", contactId: "ct_parik", at: "2026-09-04T09:34:00", duration: 109, outcome: "callback_requested", status: "completed" },
  ];

  for (const call of calls) {
    const contact = contacts.find((c) => c.id === call.contactId)!;
    const when = wall(call.at);
    const transcript = buildTranscript("Karen", contact.name, call.outcome);
    const timeline = [
      { at: when.toISOString(), label: call.direction === "inbound" ? "Call came in" : "Gates passed" },
      { at: new Date(when.getTime() + 1000).toISOString(), label: call.status === "failed" ? "Carrier failed" : "Call finished", detail: call.outcome.replaceAll("_", " ") },
    ];
    await prisma.call.create({
      data: {
        id: call.id,
        contactId: call.contactId,
        officeId: call.office === null ? null : "office_virtual",
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
        officeId: "office_virtual",
        status: "queued",
        consent: "high",
        isTest: true,
        direction: "outbound",
        triggeredAt: wall("2026-09-30T12:00:00"),
        createdAt: queuedAt,
        timeline: [{ at: queuedAt.toISOString(), label: "Waiting for a dialing slot" }] as Prisma.InputJsonValue,
      },
      {
        id: "call_q_eva",
        contactId: "ct_eva",
        officeId: "office_virtual",
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

  await prisma.callingRulesVersion.create({
    data: {
      version: 1,
      status: "published",
      config: DEFAULT_POLICY,
      authorId: "user_owner",
      authorName: "Alex Rivera",
      publishedAt: wall("2026-09-20T09:00:00"),
      createdAt: wall("2026-09-20T09:00:00"),
    },
  });

  await prisma.agentVersion.create({
    data: {
      version: 1,
      status: "draft",
      agentName: "Karen",
      openingLine: "Hi, this is Karen with Capital Financial. I'm calling to help you set a short time with an advisor. Is now okay?",
      instructions:
        "You are Karen, the voice agent for Capital Financial. Confirm the person, offer one appointment, and stop if they decline or if consent is unclear. Never collect government IDs, account numbers, or card numbers. If they want a callback, say so and end the call.",
      authorId: "user_owner",
      authorName: "Alex Rivera",
      createdAt: wall("2026-09-24T15:00:00"),
    },
  });

  await prisma.knowledgeDoc.create({
    data: {
      id: "88723d13-2380-4081-b982-d009c695ffaf",
      title: "Capital_Financial_Voice_Agent_KB (1)",
      body: KNOWLEDGE_BODY,
      status: "live",
      publishedAt: new Date(Date.now() - 8 * 86400000),
      createdAt: new Date(Date.now() - 8 * 86400000),
      updatedAt: new Date(Date.now() - 8 * 86400000),
    },
  });

  const tags = [
    ["12/9", 75],
    ["2024", 0],
    ["2026 6:00 pm 7:00 pm mdt dr. lyla june https://example.com/workshop", 1],
    ["22 steps webinar", 0],
    ["29", 0],
    ["29 july workshop", 172],
    ["30 minute medicare → 30mm - booked call [great]", 19],
    ["30 minute medicare → 30mm - download medicare guide", 41],
    ["30 minute medicare → 30mm - download medication list", 2],
    ["30 minute medicare → 30mm optin [medicare]", 878],
  ] as const;
  for (const [name, contactCount] of tags) {
    await prisma.tag.create({ data: { name, contactCount, source: "ghl" } });
  }

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

  await prisma.integrationCheck.createMany({
    data: [
      { provider: "ghl", label: "GoHighLevel", detail: "Lead sync", status: "healthy", latencyMs: 1390, checkedAt: new Date(Date.now() - 12 * 60 * 1000) },
      { provider: "elevenlabs", label: "ElevenLabs", detail: "Conversational AI", status: "healthy", latencyMs: 240, checkedAt: new Date(Date.now() - 12 * 60 * 1000) },
      { provider: "twilio", label: "Twilio", detail: "Phone carrier", status: "healthy", latencyMs: 180, checkedAt: new Date(Date.now() - 12 * 60 * 1000) },
    ],
  });

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

  await prisma.activity.createMany({
    data: [
      { actorId: "user_owner", actorName: "Alex Rivera", action: "Published calling rules", targetType: "calling_rules", targetLabel: "v1", createdAt: wall("2026-09-20T09:00:00") },
      { actorId: "user_owner", actorName: "Alex Rivera", action: "Added an office", targetType: "office", targetLabel: "Virtual", createdAt: wall("2026-09-18T11:20:00") },
      { actorId: null, actorName: "Voice Operations", action: "Synced tags from GoHighLevel", targetType: "tag", targetLabel: "10 tags", createdAt: wall("2026-10-02T14:06:00") },
      { actorId: "user_owner", actorName: "Alex Rivera", action: "Published a knowledge document", targetType: "knowledge", targetLabel: "Capital_Financial_Voice_Agent_KB (1)", createdAt: new Date(Date.now() - 8 * 86400000) },
      { actorId: "user_admin", actorName: "Jordan Lee", action: "Turned on two-step sign-in", targetType: "user", targetLabel: "jordan.lee@capitalfinancial.example", createdAt: wall("2026-09-22T08:40:00") },
    ],
  });

  console.log("Seeded Voice Operations.");
  console.log("Owner  alex.rivera@capitalfinancial.example");
  console.log("Admin  jordan.lee@capitalfinancial.example  (two-step secret JBSWY3DPEHPK3PXP)");
  console.log("Viewer sam.patel@capitalfinancial.example");
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

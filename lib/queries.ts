import type { Prisma } from "@prisma/client";
import { clientConfig } from "./client-config";
import { prisma } from "./db";
import { evaluateGates } from "./gates";
import { hasEnv, integrationsMode } from "./env";
import { pageOf, one, type SP } from "./params";
import { getPublishedPolicy } from "./policy";
import { digitsOnly } from "./phone";
import { readinessItems } from "./readiness";
import { addDaysISO, zonedDayBounds, zonedISODate, zonedTimeToUtc, startOfWeekMonday } from "./time";
import type { GateCheckView, TimelineEvent, TranscriptLine } from "./types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function getOrg() {
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  if (!org) throw new Error("Organization is not seeded");
  return org;
}

export async function getOverview(range = "today") {
  const org = await getOrg();
  const tz = org.timezone;
  const now = new Date();
  const today = zonedDayBounds(now, tz);
  let start = today.start;
  let end = today.end;
  if (range === "yesterday") {
    start = zonedTimeToUtc(`${addDaysISO(today.iso, -1)}T00:00:00`, tz);
    end = today.start;
  } else if (range === "7d") {
    start = zonedTimeToUtc(`${addDaysISO(today.iso, -6)}T00:00:00`, tz);
  } else if (range === "30d") {
    start = zonedTimeToUtc(`${addDaysISO(today.iso, -29)}T00:00:00`, tz);
  }

  const [periodCalls, recent, live, appointments] = await Promise.all([
    prisma.call.findMany({
      where: { triggeredAt: { gte: start, lt: end } },
      include: { office: true, contact: true },
    }),
    prisma.call.findMany({
      where: { status: { in: ["completed", "failed"] } },
      include: { contact: true, office: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.call.findMany({
      where: { status: { in: ["queued", "dialing", "in_progress", "wrap_up"] } },
      include: { contact: true, office: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.appointment.count({ where: { createdAt: { gte: start, lt: end }, status: { not: "cancelled" } } }),
  ]);

  const dials = periodCalls.filter((c) => c.dialedAt).length;
  const connects = periodCalls.filter((c) => c.connected).length;
  const booked = periodCalls.filter((c) => c.booked).length + appointments;
  const durations = periodCalls.filter((c) => c.connected).map((c) => c.durationSec);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const outcomeCounts = new Map<string, number>();
  for (const call of periodCalls.filter((c) => c.status === "completed" || c.status === "failed")) {
    const key = call.outcome || "failed";
    outcomeCounts.set(key, (outcomeCounts.get(key) ?? 0) + 1);
  }

  const byOffice = new Map<string, { dials: number; connects: number }>();
  for (const call of periodCalls.filter((c) => c.dialedAt)) {
    const name = call.office?.name || "—";
    const row = byOffice.get(name) ?? { dials: 0, connects: 0 };
    row.dials += 1;
    if (call.connected) row.connects += 1;
    byOffice.set(name, row);
  }

  const chartStart = zonedTimeToUtc(`${addDaysISO(today.iso, -6)}T00:00:00`, tz);
  const chartCalls = await prisma.call.findMany({ where: { dialedAt: { gte: chartStart, lt: today.end } } });
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today.iso, -6 + i));
  const chart = days.map((iso) => {
    const from = zonedTimeToUtc(`${iso}T00:00:00`, tz).getTime();
    const to = zonedTimeToUtc(`${addDaysISO(iso, 1)}T00:00:00`, tz).getTime();
    const rows = chartCalls.filter((c) => c.dialedAt && c.dialedAt.getTime() >= from && c.dialedAt.getTime() < to);
    return {
      iso,
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(zonedTimeToUtc(`${iso}T12:00:00`, tz)),
      dials: rows.length,
      connects: rows.filter((c) => c.connected).length,
    };
  });

  return {
    org,
    range,
    kpis: {
      dials,
      connectRate: dials ? (connects / dials) * 100 : 0,
      meetings: booked,
      bookingRate: dials ? (booked / dials) * 100 : 0,
      avgLength: avg,
    },
    live: {
      queued: live.filter((c) => c.status === "queued").length,
      dialing: live.filter((c) => c.status === "dialing").length,
      inProgress: live.filter((c) => c.status === "in_progress").length,
      wrapUp: live.filter((c) => c.status === "wrap_up").length,
      items: live.map((c) => ({
        id: c.id,
        name: c.contact.name,
        office: c.office?.name || "—",
        status: c.status,
      })),
    },
    chart,
    outcomes: [...outcomeCounts.entries()].map(([outcome, count]) => ({ outcome, count })),
    offices: [...byOffice.entries()].map(([name, row]) => ({ name, ...row, rate: row.dials ? (row.connects / row.dials) * 100 : 0 })),
    funnel: {
      triggers: periodCalls.length,
      passed: periodCalls.filter((c) => c.gatesPassed).length,
      dialed: dials,
      connected: connects,
      booked,
    },
    recent: recent.map(toCallRow),
  };
}

export function toCallRow(call: {
  id: string;
  createdAt: Date;
  startedAt: Date | null;
  direction: string;
  status: string;
  outcome: string | null;
  consent: string;
  durationSec: number;
  costCents: number;
  isTest: boolean;
  transcript: unknown;
  timeline: unknown;
  gateChecks: unknown;
  recordingUrl: string | null;
  elevenLabsConversationId: string | null;
  failureReason: string | null;
  contact: { name: string; phone: string };
  office: { name: string } | null;
}) {
  return {
    id: call.id,
    time: (call.startedAt ?? call.createdAt).toISOString(),
    contactName: call.contact.name,
    phone: call.contact.phone,
    direction: call.direction,
    office: call.office?.name ?? null,
    status: call.status,
    outcome: call.outcome,
    consent: call.consent,
    durationSec: call.durationSec,
    costCents: call.costCents,
    isTest: call.isTest,
    transcript: asArray<TranscriptLine>(call.transcript),
    timeline: asArray<TimelineEvent>(call.timeline),
    gateChecks: asArray<GateCheckView>(call.gateChecks),
    recordingUrl: call.recordingUrl,
    elevenLabsId: call.elevenLabsConversationId,
    failureReason: call.failureReason,
  };
}

function callWhere(sp: SP): Prisma.CallWhereInput {
  const where: Prisma.CallWhereInput = {};
  const q = one(sp, "q").trim();
  const office = one(sp, "office");
  const outcome = one(sp, "outcome");
  const status = one(sp, "status");
  const consent = one(sp, "consent");
  const tests = one(sp, "tests");
  const from = one(sp, "from");
  const to = one(sp, "to");
  if (office) where.officeId = office;
  if (outcome) where.outcome = outcome as Prisma.CallWhereInput["outcome"];
  if (status) where.status = status as Prisma.CallWhereInput["status"];
  if (consent) where.consent = consent as Prisma.CallWhereInput["consent"];
  if (tests === "hidden") where.isTest = false;
  if (tests === "shown") where.isTest = true;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59`);
  }
  if (q) {
    const digits = digitsOnly(q);
    where.OR = [
      { contact: { name: { contains: q, mode: "insensitive" } } },
      ...(digits ? [{ contact: { phone: { contains: digits } } }] : []),
    ];
  }
  return where;
}

export async function listCalls(sp: SP) {
  const { page, perPage, skip } = pageOf(sp);
  const where = callWhere(sp);
  const [rows, total, offices] = await Promise.all([
    prisma.call.findMany({
      where,
      include: { contact: true, office: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: perPage,
    }),
    prisma.call.count({ where }),
    prisma.office.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { rows: rows.map(toCallRow), total, page, perPage, offices };
}

export async function listAppointments(sp: SP) {
  const { page, perPage, skip } = pageOf(sp);
  const where: Prisma.AppointmentWhereInput = {};
  const office = one(sp, "office");
  const status = one(sp, "status");
  const format = one(sp, "format");
  const timing = one(sp, "timing");
  const from = one(sp, "from");
  const to = one(sp, "to");
  if (office) where.officeId = office;
  if (status) where.status = status as Prisma.AppointmentWhereInput["status"];
  if (format) where.format = format as Prisma.AppointmentWhereInput["format"];
  if (timing === "upcoming") where.startsAt = { gte: new Date() };
  if (timing === "past") where.startsAt = { lt: new Date() };
  if (from || to) {
    where.startsAt = {
      ...(typeof where.startsAt === "object" ? where.startsAt : {}),
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }
  const [rows, total, matching, offices] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: { contact: true, office: true },
      orderBy: { startsAt: "asc" },
      skip,
      take: perPage,
    }),
    prisma.appointment.count({ where }),
    prisma.appointment.count(),
    prisma.office.findMany({ orderBy: { name: "asc" } }),
  ]);
  const confirmed = rows.filter((r) => r.status === "confirmed").length;
  const upcoming = rows.filter((r) => r.startsAt.getTime() >= Date.now() && r.status !== "cancelled").length;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      contact: r.contact.name,
      phone: r.contact.phone,
      advisor: r.advisorName,
      office: r.office.name,
      when: r.startsAt.toISOString(),
      format: r.format,
      status: r.status,
    })),
    total,
    page,
    perPage,
    offices,
    kpis: { matching, confirmed, upcoming },
  };
}

export async function listContacts(sp: SP) {
  const { page, perPage, skip } = pageOf(sp);
  const where: Prisma.ContactWhereInput = {};
  const q = one(sp, "q").trim();
  const office = one(sp, "office");
  const consent = one(sp, "consent");
  const dnc = one(sp, "dnc");
  if (office) where.officeId = office;
  if (consent) where.consent = consent as Prisma.ContactWhereInput["consent"];
  if (q) {
    const digits = digitsOnly(q);
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      ...(digits ? [{ phone: { contains: digits } }] : []),
    ];
  }
  const dncRows = await prisma.doNotCall.findMany({ where: { active: true } });
  const dncDigits = new Set(dncRows.map((r) => digitsOnly(r.phone)));
  if (dnc === "on" || dnc === "off") {
    const all = await prisma.contact.findMany({ select: { id: true, phone: true } });
    const ids = all.filter((c) => dncDigits.has(digitsOnly(c.phone)) === (dnc === "on")).map((c) => c.id);
    where.id = { in: ids.length ? ids : ["__none__"] };
  }
  const [rows, total, offices] = await Promise.all([
    prisma.contact.findMany({ where, include: { office: true }, orderBy: { createdAt: "desc" }, skip, take: perPage }),
    prisma.contact.count({ where }),
    prisma.office.findMany({ orderBy: { name: "asc" } }),
  ]);
  return {
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      office: c.office?.name ?? null,
      consent: c.consent,
      dnc: dncDigits.has(digitsOnly(c.phone)),
      added: c.createdAt.toISOString(),
    })),
    total,
    page,
    perPage,
    offices,
  };
}

export async function listDnc(sp: SP) {
  const { page, perPage, skip } = pageOf(sp);
  const where: Prisma.DoNotCallWhereInput = {};
  const q = digitsOnly(one(sp, "q"));
  const reason = one(sp, "reason");
  const status = one(sp, "status");
  const from = one(sp, "from");
  const to = one(sp, "to");
  if (q) where.phone = { contains: q };
  if (reason) where.reason = { contains: reason, mode: "insensitive" };
  if (status === "active") where.active = true;
  if (status === "inactive") where.active = false;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59`);
  }
  const [rows, total] = await Promise.all([
    prisma.doNotCall.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: perPage }),
    prisma.doNotCall.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      reason: r.reason,
      source: r.source,
      addedBy: r.addedByName || "—",
      added: r.createdAt.toISOString(),
      expires: r.expiresAt?.toISOString() ?? null,
      active: r.active,
    })),
    total,
    page,
    perPage,
  };
}

export async function getCalendar(officeId: string | undefined, week: string | undefined) {
  const org = await getOrg();
  const offices = await prisma.office.findMany({ include: { hours: true, advisors: true }, orderBy: { name: "asc" } });
  const office = offices.find((o) => o.id === officeId) ?? offices.find((o) => o.name === "Default office") ?? offices[0];
  const tz = office?.timezone || org.timezone;
  const anchor = week ? zonedTimeToUtc(`${week}T12:00:00`, tz) : new Date();
  const start = startOfWeekMonday(anchor, tz);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  return { org, offices, office, days, tz, weekStart: start };
}

export async function getCrm(day?: string) {
  const org = await getOrg();
  const office = await prisma.office.findFirst({
    where: { name: "Default office" },
    include: { hours: true },
  });
  const tz = office?.timezone || org.timezone;
  const iso = day || zonedISODate(new Date(), tz);
  const monthStart = `${iso.slice(0, 7)}-01`;
  const tags = await prisma.tag.findMany({ orderBy: { contactCount: "desc" } });
  const updates = await prisma.crmUpdate.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  const appointments = office
    ? await prisma.appointment.findMany({
        where: {
          officeId: office.id,
          startsAt: {
            gte: zonedTimeToUtc(`${iso}T00:00:00`, tz),
            lt: zonedTimeToUtc(`${addDaysISO(iso, 1)}T00:00:00`, tz),
          },
        },
        include: { contact: true },
      })
    : [];
  return { org, office, tz, iso, monthStart, tags, updates, appointments };
}

export async function listKnowledge(docId?: string) {
  const docs = await prisma.knowledgeDoc.findMany({ orderBy: { updatedAt: "desc" } });
  const selected = docs.find((d) => d.id === docId) ?? null;
  return { docs, selected };
}

export async function listActivity(sp: SP) {
  const { page, perPage, skip } = pageOf(sp);
  const q = one(sp, "q").trim();
  const where: Prisma.ActivityWhereInput = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { actorName: { contains: q, mode: "insensitive" } },
          { targetLabel: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.activity.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: perPage }),
    prisma.activity.count({ where }),
  ]);
  return { rows, total, page, perPage };
}

export async function listFailedJobs() {
  const jobs = await prisma.job.findMany({
    where: { status: { in: ["failed", "waiting", "running"] }, type: { in: ["crm_writeback", "inbound_event"] } },
    orderBy: { updatedAt: "desc" },
  });
  const incoming = jobs.filter((j) => j.type === "inbound_event");
  const crm = jobs.filter((j) => j.type === "crm_writeback");
  return { incoming, crm };
}

export async function getSettingsBundle() {
  const [org, policy, agentVersions, voiceVersions, offices, users, mappings, checks, activity, docs] = await Promise.all([
    getOrg(),
    getPublishedPolicy(),
    prisma.agentVersion.findMany({ orderBy: { version: "desc" } }),
    prisma.voiceVersion.findMany({ orderBy: { version: "desc" } }),
    prisma.office.findMany({ include: { advisors: true, hours: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.fieldMapping.findMany({ orderBy: { internalField: "asc" } }),
    prisma.integrationCheck.findMany(),
    prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.knowledgeDoc.findMany(),
  ]);
  const publishedAgent = agentVersions.find((v) => v.status === "published") ?? null;
  const draftAgent = agentVersions.find((v) => v.status === "draft") ?? publishedAgent;
  const readiness = readinessItems({
    testMode: org.testMode,
    scheduleEnabled: org.scheduleEnabled,
    integrationsMode: integrationsMode(),
    hasGhlKey: hasEnv("GHL_API_KEY"),
    hasGhlLocation: hasEnv("GHL_LOCATION_ID"),
    hasElevenKey: hasEnv("ELEVENLABS_API_KEY"),
    hasElevenAgent: hasEnv("ELEVENLABS_AGENT_ID"),
    hasTwilioSid: hasEnv("TWILIO_ACCOUNT_SID"),
    hasTwilioToken: hasEnv("TWILIO_AUTH_TOKEN"),
    hasTwilioNumber: hasEnv("TWILIO_PHONE_NUMBER"),
    agentPublished: Boolean(publishedAgent),
    voicePublished: voiceVersions.some((v) => v.status === "published"),
    rulesPublished: Boolean(policy.version),
    requireConsent: policy.policy.requireConsent,
    enforceDnc: policy.policy.enforceDnc,
    enforceHours: policy.policy.enforceCallingHours,
    liveKnowledge: docs.some((d) => d.status === "live"),
    officeReady: offices.some((o) => o.status === "active" && o.timezone && o.calendarName),
    anyTotp: users.some((u) => u.totpEnabled && (u.role === "owner" || u.role === "admin")),
    webhookSecrets: hasEnv("GHL_WEBHOOK_SECRET") && hasEnv("ELEVENLABS_WEBHOOK_SECRET") && hasEnv("TWILIO_AUTH_TOKEN"),
  });
  return { org, policy, agentVersions, voiceVersions, publishedAgent, draftAgent, offices, users, mappings, checks, activity, readiness };
}

export async function callingQueue() {
  const contacts = await prisma.contact.findMany({ include: { office: true }, orderBy: { createdAt: "desc" }, take: 40 });
  const { policy } = await getPublishedPolicy();
  const dncRows = await prisma.doNotCall.findMany({ where: { active: true } });
  const dncDigits = new Set(dncRows.map((r) => digitsOnly(r.phone)));
  const rows = [];
  for (const contact of contacts) {
    const attempts = await prisma.call.count({ where: { contactId: contact.id, dialedAt: { not: null } } });
    const tz = contact.timezone || contact.office?.timezone || clientConfig().timezone;
    const bounds = zonedDayBounds(new Date(), tz);
    const dialsToday = await prisma.call.count({ where: { dialedAt: { gte: bounds.start, lt: bounds.end } } });
    const gate = evaluateGates({
      now: new Date(),
      timeZone: tz,
      consent: contact.consent,
      onDoNotCall: dncDigits.has(digitsOnly(contact.phone)),
      dialsToday,
      attemptsForContact: attempts,
      policy,
    });
    rows.push({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      source: contact.source,
      status: gate.passed ? "Eligible" : "Held",
      reason: gate.passed ? "Passes consent, do-not-call, hours, and caps." : gate.checks.filter((c) => !c.passed).map((c) => c.detail).join(" "),
    });
  }
  return rows;
}

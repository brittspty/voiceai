"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Consent, OfficeStatus, OfficeType, Prisma, Role } from "@prisma/client";
import QRCode from "qrcode";
import { checkEleven, checkGhl, checkTwilio } from "./adapters";
import { clientConfig, parseBrandColor, parseLogoUrl, parseMark } from "./client-config";
import { audit } from "./audit";
import { canWrite, isOwner, requireUser } from "./auth";
import { prisma } from "./db";
import { gateContextForContact } from "./dialer";
import { evaluateGates } from "./gates";
import { enqueue } from "./queue";
import { asPolicy } from "./policy";
import { normalizePhone } from "./phone";
import { randomTotpSecret, totpUri, verifyTotp } from "./totp";
import type { CallOutcomeName, CallingPolicy } from "./types";
import { DEFAULT_POLICY } from "./types";

function assertWrite(role: Role) {
  if (!canWrite(role)) throw new Error("You have view-only access.");
}

function assertOwner(role: Role) {
  if (!isOwner(role)) throw new Error("Only an owner can do that.");
}

export async function preflightCall(input: { contactId?: string; phone?: string; consent?: Consent; timeZone?: string }) {
  await requireUser();
  if (input.contactId) {
    const ctx = await gateContextForContact(input.contactId);
    return evaluateGates(ctx.gate);
  }
  const phone = normalizePhone(input.phone || "");
  const { policy } = await (await import("./policy")).getPublishedPolicy();
  const dnc = phone
    ? await prisma.doNotCall.findFirst({ where: { active: true, phone: { contains: phone.replace(/\D/g, "").slice(-10) } } })
    : null;
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  const tz = input.timeZone || org?.timezone || clientConfig().timezone;
  const { zonedDayBounds } = await import("./time");
  const bounds = zonedDayBounds(new Date(), tz);
  const dialsToday = await prisma.call.count({ where: { dialedAt: { gte: bounds.start, lt: bounds.end } } });
  return evaluateGates({
    now: new Date(),
    timeZone: tz,
    consent: input.consent ?? "none",
    onDoNotCall: Boolean(dnc),
    dialsToday,
    attemptsForContact: 0,
    policy,
  });
}

export async function startTestCall(input: {
  contactId?: string;
  name?: string;
  phone?: string;
  consent?: Consent;
  officeId?: string;
  simulatedOutcome?: CallOutcomeName;
}) {
  const user = await requireUser();
  assertWrite(user.role);
  let contact = input.contactId ? await prisma.contact.findUnique({ where: { id: input.contactId } }) : null;
  if (!contact) {
    const phone = normalizePhone(input.phone || "");
    if (!phone) throw new Error("Enter a phone number.");
    contact = await prisma.contact.findFirst({ where: { phone } });
    if (!contact) {
      const office = input.officeId
        ? await prisma.office.findUnique({ where: { id: input.officeId } })
        : await prisma.office.findFirst({ where: { type: "virtual" } });
      contact = await prisma.contact.create({
        data: {
          name: input.name?.trim() || "Test lead",
          phone,
          consent: input.consent ?? "high",
          consentAt: new Date(),
          source: "Test console",
          officeId: office?.id,
          timezone: office?.timezone || clientConfig().timezone,
        },
      });
    }
  }
  const call = await prisma.call.create({
    data: {
      contactId: contact.id,
      officeId: input.officeId || contact.officeId,
      status: "queued",
      consent: contact.consent,
      isTest: true,
      direction: "outbound",
      timeline: [{ at: new Date().toISOString(), label: "Test call queued from the console" }],
    },
  });
  await enqueue({
    type: "dial",
    callId: call.id,
    contactId: contact.id,
    payload: { callId: call.id, simulatedOutcome: input.simulatedOutcome || "callback_requested" },
  });
  await audit(user, "Started a test call", { type: "call", id: call.id, label: contact.name });
  revalidatePath("/");
  revalidatePath("/calls");
  return { callId: call.id };
}

export async function addDnc(input: { phone: string; reason: string; expires?: string }) {
  const user = await requireUser();
  assertWrite(user.role);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Enter a phone number.");
  const row = await prisma.doNotCall.create({
    data: {
      phone,
      reason: input.reason.trim() || "Operator request",
      source: "Manual",
      addedById: user.id,
      addedByName: user.name,
      expiresAt: input.expires ? new Date(input.expires) : null,
    },
  });
  await audit(user, "Added a do-not-call number", { type: "dnc", id: row.id, label: phone });
  revalidatePath("/calls/do-not-call");
}

export async function importDnc(csv: string) {
  const user = await requireUser();
  assertWrite(user.role);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const [phoneRaw, reason] = line.split(/[,;\t]/);
    const phone = normalizePhone(phoneRaw || "");
    if (!phone) continue;
    await prisma.doNotCall.create({
      data: { phone, reason: reason?.trim() || "Imported", source: "Import", addedById: user.id, addedByName: user.name },
    });
    count += 1;
  }
  await audit(user, `Imported ${count} do-not-call numbers`, { type: "dnc", label: `${count} numbers` });
  revalidatePath("/calls/do-not-call");
  return { count };
}

export async function setDncActive(id: string, active: boolean) {
  const user = await requireUser();
  assertWrite(user.role);
  const row = await prisma.doNotCall.update({ where: { id }, data: { active } });
  await audit(user, active ? "Reactivated a do-not-call number" : "Deactivated a do-not-call number", {
    type: "dnc",
    id,
    label: row.phone,
  });
  revalidatePath("/calls/do-not-call");
}

export async function saveKnowledge(input: { id?: string; title: string; body: string; publish?: boolean }) {
  const user = await requireUser();
  assertWrite(user.role);
  const data = {
    title: input.title.trim() || "Untitled document",
    body: input.body,
    status: input.publish ? "live" : "draft",
    publishedAt: input.publish ? new Date() : null,
  } as const;
  const doc = input.id
    ? await prisma.knowledgeDoc.update({ where: { id: input.id }, data })
    : await prisma.knowledgeDoc.create({ data });
  await audit(user, input.publish ? "Published a knowledge document" : "Saved a knowledge document", {
    type: "knowledge",
    id: doc.id,
    label: doc.title,
  });
  revalidatePath("/knowledge");
  return { id: doc.id };
}

export async function saveWorkspace(input: { name: string; subtitle: string; timezone: string; brandColor: string; logoUrl: string; mark: string }) {
  const user = await requireUser();
  assertOwner(user.role);
  const name = input.name.trim();
  if (!name) throw new Error("Enter a company name.");
  const timezone = input.timezone.trim();
  if (!timezone) throw new Error("Enter a timezone.");
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("Use an IANA timezone such as America/New_York.");
  }
  const brandColor = parseBrandColor(input.brandColor);
  if (!brandColor) throw new Error("Use a hex color such as #2563eb.");
  const logoUrl = parseLogoUrl(input.logoUrl);
  if (logoUrl === null) throw new Error("Logo URL must be an http or https address.");
  await prisma.org.update({
    where: { id: "org" },
    data: {
      name,
      subtitle: input.subtitle.trim() || "Voice Ops",
      timezone,
      brandColor,
      logoUrl,
      mark: parseMark(input.mark),
    },
  });
  await audit(user, "Updated the workspace", { type: "org", id: "org", label: name });
  revalidatePath("/", "layout");
  revalidatePath("/settings/agent");
}

export async function saveAgentDraft(input: { agentName: string; instructions: string; openingLine: string }) {
  const user = await requireUser();
  assertOwner(user.role);
  const latest = await prisma.agentVersion.findFirst({ orderBy: { version: "desc" } });
  const version = (latest?.version ?? 0) + 1;
  await prisma.org.update({ where: { id: "org" }, data: { agentName: input.agentName.trim() || clientConfig().agentName } });
  const row = await prisma.agentVersion.create({
    data: {
      version,
      status: "draft",
      agentName: input.agentName.trim() || clientConfig().agentName,
      instructions: input.instructions,
      openingLine: input.openingLine,
      authorId: user.id,
      authorName: user.name,
    },
  });
  await audit(user, "Saved a draft of the agent instructions", { type: "agent", id: row.id, label: `v${version}` });
  revalidatePath("/settings/agent");
}

export async function publishAgent(id: string) {
  const user = await requireUser();
  assertOwner(user.role);
  const row = await prisma.agentVersion.findUnique({ where: { id } });
  if (!row) throw new Error("Draft not found");
  await prisma.agentVersion.updateMany({ where: { status: "published" }, data: { status: "draft" } });
  await prisma.agentVersion.update({ where: { id }, data: { status: "published", publishedAt: new Date() } });
  await prisma.org.update({ where: { id: "org" }, data: { agentName: row.agentName } });
  await audit(user, "Published agent instructions", { type: "agent", id, label: `v${row.version}` });
  revalidatePath("/settings/agent");
  revalidatePath("/calls/voice");
}

export async function publishVoice(voiceId: string, voiceName: string) {
  const user = await requireUser();
  assertOwner(user.role);
  const latest = await prisma.voiceVersion.findFirst({ orderBy: { version: "desc" } });
  await prisma.voiceVersion.updateMany({ where: { status: "published" }, data: { status: "draft" } });
  const row = await prisma.voiceVersion.create({
    data: {
      version: (latest?.version ?? 0) + 1,
      status: "published",
      voiceId,
      voiceName,
      authorId: user.id,
      authorName: user.name,
      publishedAt: new Date(),
    },
  });
  await audit(user, "Made a voice live", { type: "voice", id: row.id, label: voiceName });
  revalidatePath("/settings/voice");
}

export async function publishRules(config: CallingPolicy) {
  const user = await requireUser();
  assertOwner(user.role);
  const policy = asPolicy({ ...DEFAULT_POLICY, ...config });
  const latest = await prisma.callingRulesVersion.findFirst({ orderBy: { version: "desc" } });
  await prisma.callingRulesVersion.updateMany({ where: { status: "published" }, data: { status: "draft" } });
  const row = await prisma.callingRulesVersion.create({
    data: {
      version: (latest?.version ?? 0) + 1,
      status: "published",
      config: policy as unknown as Prisma.InputJsonValue,
      authorId: user.id,
      authorName: user.name,
      publishedAt: new Date(),
    },
  });
  await audit(user, "Published calling rules", { type: "calling_rules", id: row.id, label: `v${row.version}` });
  revalidatePath("/settings/calling-rules");
  revalidatePath("/settings/capabilities");
}

export async function updateSwitches(input: { requireConsent: boolean; enforceDnc: boolean; enforceCallingHours: boolean; testMode: boolean; scheduleEnabled: boolean }) {
  const user = await requireUser();
  assertOwner(user.role);
  const { policy, version } = await (await import("./policy")).getPublishedPolicy();
  const next = { ...policy, requireConsent: input.requireConsent, enforceDnc: input.enforceDnc, enforceCallingHours: input.enforceCallingHours };
  const latest = await prisma.callingRulesVersion.findFirst({ orderBy: { version: "desc" } });
  if (version) {
    await prisma.callingRulesVersion.update({ where: { id: version.id }, data: { config: next as unknown as Prisma.InputJsonValue } });
  } else {
    await prisma.callingRulesVersion.create({
      data: {
        version: (latest?.version ?? 0) + 1,
        status: "published",
        config: next as unknown as Prisma.InputJsonValue,
        authorId: user.id,
        authorName: user.name,
        publishedAt: new Date(),
      },
    });
  }
  await prisma.org.update({ where: { id: "org" }, data: { testMode: input.testMode, scheduleEnabled: input.scheduleEnabled } });
  await audit(user, "Updated safety switches", { type: "settings", label: input.testMode ? "Test mode on" : "Test mode off" });
  revalidatePath("/settings/capabilities");
  revalidatePath("/settings/production");
}

export async function addOffice(input: { name: string; timezone: string; type: OfficeType; calendarName: string; advisor: string }) {
  const user = await requireUser();
  assertWrite(user.role);
  const office = await prisma.office.create({
    data: {
      name: input.name.trim(),
      timezone: input.timezone,
      type: input.type,
      calendarName: input.calendarName.trim() || input.name.trim(),
      status: "active",
      syncedAt: new Date(),
      advisors: { create: { name: input.advisor.trim() || "Advisor" } },
      hours: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          closed: weekday !== 5,
          openTime: "10:00",
          closeTime: "17:00",
        })),
      },
    },
  });
  await audit(user, "Added an office", { type: "office", id: office.id, label: office.name });
  revalidatePath("/settings/offices");
}

export async function setOfficeStatus(id: string, status: OfficeStatus) {
  const user = await requireUser();
  assertWrite(user.role);
  const office = await prisma.office.update({ where: { id }, data: { status } });
  await audit(user, status === "paused" ? "Paused calling for an office" : "Resumed calling for an office", {
    type: "office",
    id,
    label: office.name,
  });
  revalidatePath("/settings/offices");
  revalidatePath("/settings/calling");
}

export async function addUser(input: { name: string; email: string; role: Role; password: string }) {
  const user = await requireUser();
  assertOwner(user.role);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const created = await prisma.user.create({
    data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, passwordHash },
  });
  await audit(user, "Added a user", { type: "user", id: created.id, label: created.email });
  revalidatePath("/settings/users");
}

export async function beginTotp() {
  const user = await requireUser();
  const secret = randomTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpPendingSecret: secret } });
  const uri = totpUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return { secret, qr };
}

export async function confirmTotp(code: string) {
  const user = await requireUser();
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row?.totpPendingSecret) throw new Error("Start two-step setup first.");
  const ok = await verifyTotp(row.totpPendingSecret, code);
  if (!ok) throw new Error("That code doesn't match.");
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: row.totpPendingSecret, totpPendingSecret: null, totpEnabled: true },
  });
  await audit(user, "Turned on two-step sign-in", { type: "user", id: user.id, label: user.email });
  revalidatePath("/settings/users");
}

export async function disableTotp(userId: string) {
  const user = await requireUser();
  if (user.id !== userId) assertOwner(user.role);
  const target = await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpPendingSecret: null },
  });
  await audit(user, "Turned off two-step sign-in", { type: "user", id: userId, label: target.email });
  revalidatePath("/settings/users");
}

export async function refreshIntegrations() {
  const user = await requireUser();
  assertWrite(user.role);
  const checks = [
    { provider: "ghl", label: "GoHighLevel", ...(await checkGhl()) },
    { provider: "elevenlabs", label: "ElevenLabs", ...(await checkEleven()) },
    { provider: "twilio", label: "Twilio", ...(await checkTwilio()) },
  ];
  for (const check of checks) {
    await prisma.integrationCheck.upsert({
      where: { provider: check.provider },
      update: { status: check.status, latencyMs: check.latencyMs, detail: check.detail, label: check.label, checkedAt: new Date() },
      create: { provider: check.provider, label: check.label, status: check.status, latencyMs: check.latencyMs, detail: check.detail, checkedAt: new Date() },
    });
  }
  await audit(user, "Ran an integration health check", { type: "integration", label: "GoHighLevel, ElevenLabs, Twilio" });
  revalidatePath("/settings/integrations");
}

export async function refreshCalendar(officeId: string) {
  const user = await requireUser();
  assertWrite(user.role);
  await prisma.office.update({ where: { id: officeId }, data: { syncedAt: new Date() } });
  await audit(user, "Refreshed calendar availability from GoHighLevel", { type: "office", id: officeId });
  revalidatePath("/calls/calendar");
  revalidatePath("/calls/crm");
}

export async function retryJob(id: string) {
  const user = await requireUser();
  assertWrite(user.role);
  await prisma.job.update({
    where: { id },
    data: { status: "waiting", runAt: new Date(), lastError: null, finishedAt: null, attempts: 0 },
  });
  await audit(user, "Retried a failed job", { type: "job", id });
  revalidatePath("/settings/failed-jobs");
}

export async function retryAllJobs() {
  const user = await requireUser();
  assertWrite(user.role);
  await prisma.job.updateMany({
    where: { status: "failed" },
    data: { status: "waiting", runAt: new Date(), lastError: null, finishedAt: null, attempts: 0 },
  });
  await audit(user, "Retried every failed job", { type: "job", label: "all waiting" });
  revalidatePath("/settings/failed-jobs");
}

export async function discardJob(id: string) {
  const user = await requireUser();
  assertWrite(user.role);
  await prisma.job.update({ where: { id }, data: { status: "discarded", finishedAt: new Date() } });
  await audit(user, "Discarded a failed job", { type: "job", id });
  revalidatePath("/settings/failed-jobs");
}

export async function saveMapping(id: string, ghlField: string, enabled: boolean) {
  const user = await requireUser();
  assertWrite(user.role);
  const row = await prisma.fieldMapping.update({ where: { id }, data: { ghlField, enabled } });
  await audit(user, "Updated a CRM field mapping", { type: "field_mapping", id, label: row.internalField });
  revalidatePath("/settings/capabilities");
}

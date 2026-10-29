"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { Consent, OfficeStatus, OfficeType, Prisma, Role } from "@prisma/client";
import QRCode from "qrcode";
import { checkEleven, checkGhl, checkTwilio } from "./adapters";
import { clientConfig, parseBrandColor, parseLogoUrl, parseMark } from "./client-config";
import { goLiveBlockReason } from "./customer-copy";
import { getSettingsBundle } from "./queries";
import { TEST_STRIP_COOKIE } from "./ui-prefs";
import { audit } from "./audit";
import { canOpenOperatorSettings, canWrite, isOwner, isSuperAdmin, requireStaffUser, requireUser } from "./auth";
import { appUrl } from "./env";
import { sendInviteEmail } from "./mail";
import { createHash, randomBytes } from "node:crypto";
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
  const user = await requireStaffUser();
  assertWrite(user.role);
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
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
  assertWrite(user.role);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let count = 0;
  let skipped = 0;
  for (const line of lines) {
    const [phoneRaw, reason] = line.split(/[,;\t]/);
    const phone = normalizePhone(phoneRaw || "");
    if (!phone) {
      skipped += 1;
      continue;
    }
    await prisma.doNotCall.create({
      data: { phone, reason: reason?.trim() || "Imported", source: "Import", addedById: user.id, addedByName: user.name },
    });
    count += 1;
  }
  await audit(user, `Imported ${count} do-not-call numbers`, { type: "dnc", label: `${count} numbers` });
  revalidatePath("/calls/do-not-call");
  return { count, skipped };
}

export async function setDncActive(id: string, active: boolean) {
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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
  if (!brandColor) throw new Error("Use a hex color such as #FF5800.");
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
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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

export async function updateSwitches(input: { requireConsent: boolean; enforceDnc: boolean; enforceCallingHours: boolean; testMode: boolean; scheduleEnabled: boolean; confirm?: string }) {
  const user = await requireStaffUser();
  if (!canOpenOperatorSettings(user.role)) throw new Error("Only an owner or super admin can do that.");
  const org = await prisma.org.findUnique({ where: { id: "org" } });
  if (!org) throw new Error("Organization is not seeded");
  if (org.testMode && !input.testMode) {
    const bundle = await getSettingsBundle();
    const reason = goLiveBlockReason({ confirm: input.confirm, items: bundle.readiness });
    if (reason) throw new Error(reason);
  }
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
  revalidatePath("/", "layout");
}

export async function dismissTestStrip() {
  await requireUser();
  const jar = await cookies();
  jar.set(TEST_STRIP_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
}

export async function addOffice(input: { name: string; timezone: string; type: OfficeType; calendarName: string; advisor: string }) {
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
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

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function inviteTeammate(input: { name: string; email: string; role: Role }) {
  const user = await requireStaffUser();
  if (!canOpenOperatorSettings(user.role)) throw new Error("Only an owner or super admin can do that.");
  if (input.role !== "owner" && input.role !== "admin" && input.role !== "viewer") {
    throw new Error("That role is assigned separately.");
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new Error("Enter a name.");
  if (!email.includes("@")) throw new Error("Enter a work email.");
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("That person already has an account.");
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.invite.deleteMany({ where: { email } });
  await prisma.invite.create({
    data: { email, name, role: input.role, tokenHash: hashInviteToken(token), expiresAt, createdById: user.id },
  });
  const link = `${appUrl()}/invite/${token}`;
  const mailed = await sendInviteEmail({ to: email, name, link });
  await audit(user, "Invited a teammate", { type: "user", label: email });
  revalidatePath("/settings/users");
  return { emailed: mailed.sent, link: mailed.sent ? "" : link };
}

export async function acceptInvite(input: { token: string; password: string }) {
  const password = input.password;
  if (password.length < 10) throw new Error("Use at least 10 characters.");
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(input.token.trim()) } });
  if (!invite || invite.expiresAt.getTime() < Date.now()) throw new Error("This invite link is no longer valid. Ask for a new one.");
  if (await prisma.user.findUnique({ where: { email: invite.email } })) throw new Error("That person already has an account.");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { name: invite.name, email: invite.email, role: invite.role, passwordHash } });
  await prisma.invite.delete({ where: { id: invite.id } });
}

export async function requestAccess(input: { name: string; email: string; business: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const business = input.business.trim();
  if (!name || !email.includes("@") || !business) throw new Error("Enter your name, work email, and business.");
  await prisma.accessRequest.create({ data: { name, email, business } });
}

export async function beginTotp() {
  const user = await requireStaffUser();
  const secret = randomTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpPendingSecret: secret } });
  const uri = totpUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return { secret, qr };
}

export async function confirmTotp(code: string) {
  const user = await requireStaffUser();
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
  const user = await requireStaffUser();
  if (user.id !== userId) assertOwner(user.role);
  const target = await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpPendingSecret: null },
  });
  await audit(user, "Turned off two-step sign-in", { type: "user", id: userId, label: target.email });
  revalidatePath("/settings/users");
}

export async function refreshIntegrations() {
  const user = await requireStaffUser();
  if (!canOpenOperatorSettings(user.role)) throw new Error("Only an owner or super admin can do that.");
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
  const user = await requireStaffUser();
  assertWrite(user.role);
  await prisma.office.update({ where: { id: officeId }, data: { syncedAt: new Date() } });
  await audit(user, "Refreshed calendar availability from GoHighLevel", { type: "office", id: officeId });
  revalidatePath("/calls/calendar");
  revalidatePath("/calls/crm");
}

export async function retryJob(id: string) {
  const user = await requireStaffUser();
  assertWrite(user.role);
  await prisma.job.update({
    where: { id },
    data: { status: "waiting", runAt: new Date(), lastError: null, finishedAt: null, attempts: 0 },
  });
  await audit(user, "Retried a failed job", { type: "job", id });
  revalidatePath("/settings/failed-jobs");
}

export async function retryAllJobs() {
  const user = await requireStaffUser();
  assertWrite(user.role);
  await prisma.job.updateMany({
    where: { status: "failed" },
    data: { status: "waiting", runAt: new Date(), lastError: null, finishedAt: null, attempts: 0 },
  });
  await audit(user, "Retried every failed job", { type: "job", label: "all waiting" });
  revalidatePath("/settings/failed-jobs");
}

export async function discardJob(id: string) {
  const user = await requireStaffUser();
  assertWrite(user.role);
  await prisma.job.update({ where: { id }, data: { status: "discarded", finishedAt: new Date() } });
  await audit(user, "Discarded a failed job", { type: "job", id });
  revalidatePath("/settings/failed-jobs");
}

export async function saveMapping(id: string, ghlField: string, enabled: boolean) {
  const user = await requireStaffUser();
  if (!isSuperAdmin(user.role)) throw new Error("Only Specificity can change CRM keys.");
  const row = await prisma.fieldMapping.update({ where: { id }, data: { ghlField, enabled } });
  await audit(user, "Updated a CRM field mapping", { type: "field_mapping", id, label: row.internalField });
  revalidatePath("/settings/capabilities");
}

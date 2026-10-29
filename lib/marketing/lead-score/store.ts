import type { Prisma } from "@prisma/client";
import { audit } from "../../audit";
import { prisma } from "../../db";
import { digitsOnly } from "../../phone";
import { leadScoringEnabled } from "../config";
import { classifierFromEnv, classifyLead } from "./classify";
import { markAuditAction, toLeadView, transcriptText, type LeadRowView } from "./present";
import type { LeadInput, LeadLabel } from "./types";

const rowInclude = {
  contact: { select: { name: true, phone: true, email: true, source: true } },
  overriddenBy: { select: { name: true } },
  call: {
    select: {
      durationSec: true,
      outcome: true,
      transcript: true,
      contact: { select: { name: true, phone: true, email: true, source: true } },
    },
  },
} satisfies Prisma.LeadScoreInclude;

type StoredRow = Prisma.LeadScoreGetPayload<{ include: typeof rowInclude }>;

function viewOf(row: StoredRow): LeadRowView {
  return toLeadView({
    id: row.id,
    label: row.label,
    score: row.score,
    reason: row.reason,
    model: row.model,
    overrideLabel: row.overrideLabel,
    overrideReason: row.overrideReason,
    overriddenAt: row.overriddenAt,
    overriddenByName: row.overriddenBy?.name ?? "",
    contact: row.contact,
    call: row.call,
  });
}

async function onDoNotCall(phone: string) {
  const digits = digitsOnly(phone);
  if (digits.length < 7) return false;
  const rows = await prisma.doNotCall.findMany({
    where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { phone: true },
  });
  return rows.some((row) => digitsOnly(row.phone) === digits);
}

async function saveMachine(where: { contactId: string } | { callId: string }, input: LeadInput, evidence: Prisma.InputJsonValue, rulesOnly: boolean) {
  const classification = await classifyLead(input, { provider: rulesOnly ? null : classifierFromEnv(process.env) });
  const data = {
    label: classification.label,
    score: classification.score,
    reason: classification.reason,
    model: classification.model,
    evidence,
  };
  if ("contactId" in where) {
    return prisma.leadScore.upsert({
      where: { contactId: where.contactId },
      create: { contactId: where.contactId, ...data },
      update: data,
      include: rowInclude,
    });
  }
  return prisma.leadScore.upsert({
    where: { callId: where.callId },
    create: { callId: where.callId, ...data },
    update: data,
    include: rowInclude,
  });
}

export async function scoreFormLeadIfEnabled(
  input: { contactId: string; name: string; phone: string; email: string | null; message: string; source: string },
  options: { rulesOnly?: boolean } = {},
) {
  if (!leadScoringEnabled()) return { status: "skipped" as const };
  try {
    await saveMachine(
      { contactId: input.contactId },
      {
        kind: "form",
        name: input.name,
        phone: input.phone,
        email: input.email,
        message: input.message,
        transcript: "",
        durationSec: null,
        outcome: null,
        onDoNotCall: await onDoNotCall(input.phone),
      },
      { message: input.message, source: input.source },
      Boolean(options.rulesOnly),
    );
    return { status: "scored" as const };
  } catch (error) {
    console.error("Lead scoring failed", error instanceof Error ? error.message : "error");
    return { status: "error" as const };
  }
}

export async function scoreCallIfEnabled(callId: string, options: { rulesOnly?: boolean } = {}) {
  if (!leadScoringEnabled()) return { status: "skipped" as const };
  try {
    const call = await prisma.call.findUnique({ where: { id: callId }, include: { contact: true } });
    if (!call) return { status: "skipped" as const };
    const transcript = transcriptText(call.transcript);
    await saveMachine(
      { callId: call.id },
      {
        kind: "call",
        name: call.contact.name,
        phone: call.contact.phone,
        email: call.contact.email,
        message: "",
        transcript,
        durationSec: call.durationSec,
        outcome: call.outcome,
        onDoNotCall: await onDoNotCall(call.contact.phone),
      },
      { outcome: call.outcome, durationSec: call.durationSec },
      Boolean(options.rulesOnly),
    );
    return { status: "scored" as const };
  } catch (error) {
    console.error("Lead scoring failed", error instanceof Error ? error.message : "error");
    return { status: "error" as const };
  }
}

/** Backfill uses rules only so opening the page does not call the model once per lead. */
export async function scoreMissingLeads(limit = 40) {
  if (!leadScoringEnabled()) return 0;
  const contacts = await prisma.contact.findMany({
    where: { leadScore: { is: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const contact of contacts) {
    await scoreFormLeadIfEnabled(
      { contactId: contact.id, name: contact.name, phone: contact.phone, email: contact.email, message: "", source: contact.source },
      { rulesOnly: true },
    );
  }
  const calls = await prisma.call.findMany({
    where: { leadScore: { is: null }, status: "completed" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const call of calls) await scoreCallIfEnabled(call.id, { rulesOnly: true });
  return contacts.length + calls.length;
}

export async function listLeadRows() {
  const rows = await prisma.leadScore.findMany({ orderBy: { updatedAt: "desc" }, take: 200, include: rowInclude });
  return rows.map(viewOf);
}

export async function getLeadRow(id: string) {
  const row = await prisma.leadScore.findUnique({ where: { id }, include: rowInclude });
  return row ? viewOf(row) : null;
}

export async function leadsSince(previousStart: Date) {
  return prisma.leadScore.findMany({
    where: { createdAt: { gte: previousStart } },
    select: { label: true, overrideLabel: true, createdAt: true },
  });
}

export async function spendSince(start: Date) {
  const groups = await prisma.dailyMetric.groupBy({
    by: ["currency"],
    where: { date: { gte: start } },
    _sum: { spend: true },
  });
  return groups.map((group) => ({
    currency: group.currency,
    spend: Number(group._sum.spend?.toString() ?? 0) || 0,
  }));
}

export async function waitingForMarkCount() {
  return prisma.leadScore.count({ where: { overrideLabel: null } });
}

export async function markLeads(input: { ids: string[]; label: LeadLabel | null; reason: string; user: { id: string; name: string } }) {
  const existing = await prisma.leadScore.findMany({ where: { id: { in: input.ids } }, select: { id: true } });
  const saved: LeadRowView[] = [];
  for (const row of existing) {
    const next = await prisma.leadScore.update({
      where: { id: row.id },
      data: input.label
        ? { overrideLabel: input.label, overrideReason: input.reason.slice(0, 120), overriddenById: input.user.id, overriddenAt: new Date() }
        : { overrideLabel: null, overrideReason: "", overriddenById: null, overriddenAt: null },
      include: rowInclude,
    });
    const view = viewOf(next);
    await audit({ id: input.user.id, name: input.user.name }, markAuditAction(view.name, input.label), {
      type: "lead_score",
      id: view.id,
      label: view.name,
    });
    saved.push(view);
  }
  return saved;
}

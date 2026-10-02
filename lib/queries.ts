import type { Prisma } from "@prisma/client";
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

export async function listFailedJobs() {
  const jobs = await prisma.job.findMany({
    where: { status: { in: ["failed", "waiting", "running"] }, type: { in: ["crm_writeback", "inbound_event"] } },
    orderBy: { updatedAt: "desc" },
  });
  const incoming = jobs.filter((j) => j.type === "inbound_event");
  const crm = jobs.filter((j) => j.type === "crm_writeback");
  return { incoming, crm };
}

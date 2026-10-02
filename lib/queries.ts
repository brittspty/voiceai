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

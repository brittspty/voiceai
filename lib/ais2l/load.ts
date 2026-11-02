import { prisma } from "../db";
import { ais2lCallFromRow, exampleAis2lCalls, testPill } from "./screen";
import type { TranscriptLine } from "../types";

function asLines(value: unknown): TranscriptLine[] {
  return Array.isArray(value) ? (value as TranscriptLine[]) : [];
}

export async function loadAis2lCalls(orgTestMode: boolean) {
  const calls = await prisma.call.findMany({
    include: { contact: true, office: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const ids = calls.map((call) => call.id);
  const updates = ids.length
    ? await prisma.crmUpdate.findMany({
        where: { callId: { in: ids } },
        orderBy: { createdAt: "desc" },
        select: { callId: true, status: true },
      })
    : [];
  const status = new Map<string, string>();
  for (const update of updates) {
    if (update.callId && !status.has(update.callId)) status.set(update.callId, update.status);
  }
  const views = calls.map((call) =>
    ais2lCallFromRow({
      id: call.id,
      contactName: call.contact.name,
      office: call.office?.name ?? null,
      outcome: call.outcome,
      durationSec: call.durationSec,
      transcript: asLines(call.transcript),
      crmStatus: status.get(call.id) ?? null,
    }),
  );
  return {
    testPill: testPill(orgTestMode),
    example: views.length === 0,
    calls: views.length ? views : exampleAis2lCalls(),
  };
}

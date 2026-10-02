import type { JobType, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { redisPush } from "./redis";

export const JOB_QUEUE_KEY = "voiceops:jobs";

export async function enqueue(input: {
  type: JobType;
  payload: Prisma.InputJsonValue;
  runAt?: Date;
  callId?: string | null;
  contactId?: string | null;
  maxAttempts?: number;
}) {
  const job = await prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload,
      runAt: input.runAt ?? new Date(),
      callId: input.callId ?? null,
      contactId: input.contactId ?? null,
      maxAttempts: input.maxAttempts ?? 3,
      status: "waiting",
    },
  });
  await redisPush(JOB_QUEUE_KEY, job.id);
  return job;
}

const BACKOFF_MS = [15_000, 60_000, 5 * 60_000];

export async function failOrRetry(jobId: string, attempts: number, maxAttempts: number, error: unknown) {
  const message = error instanceof Error ? error.message : "Job failed";
  if (attempts < maxAttempts) {
    const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 60_000;
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "waiting",
        lastError: message,
        runAt: new Date(Date.now() + delay),
        lockedAt: null,
      },
    });
    await redisPush(JOB_QUEUE_KEY, jobId);
    return;
  }
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "failed", lastError: message, finishedAt: new Date(), lockedAt: null },
  });
}

export async function claimJob() {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      type: "dial" | "crm_writeback" | "inbound_event";
      status: string;
      payload: unknown;
      attempts: number;
      maxAttempts: number;
      callId: string | null;
      contactId: string | null;
    }[]
  >`
    UPDATE "Job"
    SET status = 'running'::"JobStatus",
        attempts = attempts + 1,
        "lockedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'waiting'::"JobStatus" AND "runAt" <= NOW()
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, type::text as type, status::text as status, payload, attempts, "maxAttempts", "callId", "contactId"
  `;
  return rows[0] ?? null;
}

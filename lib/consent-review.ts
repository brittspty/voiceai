import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { createRedis } from "./redis";
import {
  consentAuditAction,
  consentAuditDetail,
  createMemoryFieldCache,
  tierToStoredConsent,
  type ConsentDecision,
  type FieldCache,
  type GhlFieldDef,
} from "./consent";
import { prisma } from "./db";
import { SYSTEM_ACTOR } from "./types";

const memory = createMemoryFieldCache();
const REDIS_PREFIX = "voiceops:ghl:custom-fields:";

export function sharedFieldCache(ttlMs: number): FieldCache {
  return {
    async get(locationId) {
      const local = await memory.get(locationId);
      if (local) return local;
      const remote = await readRedisFields(locationId);
      if (remote) {
        await memory.set(locationId, remote, ttlMs);
        return remote;
      }
      return null;
    },
    async set(locationId, fields, ttl) {
      await memory.set(locationId, fields, ttl);
      await writeRedisFields(locationId, fields, ttl);
    },
  };
}

async function readRedisFields(locationId: string): Promise<GhlFieldDef[] | null> {
  const client = createRedis();
  try {
    await client.connect();
    const raw = await client.get(`${REDIS_PREFIX}${locationId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const fields = parsed.filter((item): item is GhlFieldDef => {
      return Boolean(item && typeof item === "object" && typeof (item as GhlFieldDef).id === "string" && typeof (item as GhlFieldDef).fieldKey === "string");
    });
    return fields;
  } catch {
    return null;
  } finally {
    client.disconnect();
  }
}

async function writeRedisFields(locationId: string, fields: GhlFieldDef[], ttlMs: number) {
  const client = createRedis();
  try {
    await client.connect();
    const seconds = Math.max(1, Math.ceil(ttlMs / 1000));
    await client.set(`${REDIS_PREFIX}${locationId}`, JSON.stringify(fields), "EX", seconds);
  } catch {
    /* A cache miss refetches the field list. The dial still fails closed if that read fails. */
  } finally {
    client.disconnect();
  }
}

export async function saveConsentReview(input: {
  contactId: string;
  callId?: string | null;
  contactName: string;
  decision: ConsentDecision;
}) {
  const consent = tierToStoredConsent(input.decision.tier);
  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      consent,
      consentTier: input.decision.tier,
      consentScope: input.decision.scope,
      consentHoldReason: input.decision.allow ? null : input.decision.reason,
      consentVersion: input.decision.version,
      consentTimestamp: input.decision.timestamp,
      consentCheckedAt: new Date(),
    },
  });
  if (input.callId) {
    await prisma.call.update({
      where: { id: input.callId },
      data: { consent, consentScope: input.decision.scope },
    });
  }
  await audit(SYSTEM_ACTOR, consentAuditAction(input.decision), {
    type: input.callId ? "call" : "contact",
    id: input.callId ?? input.contactId,
    label: input.contactName,
    detail: consentAuditDetail(input.decision) as Prisma.InputJsonValue,
  });
}

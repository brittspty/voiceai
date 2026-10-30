import type { MarketingAccess } from "./access";

/** Estimated ROAS is a staff-only figure. Client roles cannot set or read it. */
export function canEditLeadValue(access: Pick<MarketingAccess, "kind">) {
  return access.kind === "super_admin" || access.kind === "account_manager";
}

const MAX_CENTS = 100_000_000;

export type ParsedLeadValue = { ok: true; leadCents: number; callCents: number | null } | { ok: false; error: string };

function dollarsToCents(raw: string) {
  const amount = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

/** Blank call value means calls use the lead value. */
export function parseLeadDollars(leadRaw: string, callRaw: string): ParsedLeadValue {
  const leadCents = dollarsToCents(leadRaw);
  if (leadCents == null || leadCents <= 0) return { ok: false, error: "Enter a lead value greater than $0." };
  if (leadCents > MAX_CENTS) return { ok: false, error: "Enter a lead value under $1,000,000." };
  const callText = callRaw.trim();
  if (!callText) return { ok: true, leadCents, callCents: null };
  const callCents = dollarsToCents(callText);
  if (callCents == null || callCents <= 0) return { ok: false, error: "Enter a call value greater than $0, or leave it blank." };
  if (callCents > MAX_CENTS) return { ok: false, error: "Enter a call value under $1,000,000." };
  return { ok: true, leadCents, callCents };
}

/**
 * (leads × leadValueCents + calls × (callValueCents ?? leadValueCents)) / 100 / spend.
 * Null when no lead value is set, so the dashboard hides estimated ROAS.
 */
export function estimatedRoas(input: { leads: number; calls: number; spend: number; leadCents: number | null; callCents: number | null }) {
  if (input.leadCents == null || input.leadCents <= 0) return null;
  if (!(input.spend > 0)) return null;
  const callCents = input.callCents ?? input.leadCents;
  const value = (input.leads * input.leadCents + input.calls * callCents) / 100;
  return value / input.spend;
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export type LeadValueSnapshot = {
  leadValueCents: number | null;
  callValueCents: number | null;
};

export type LeadValueWrite = {
  leadValueCents: number;
  callValueCents: number | null;
  userId: string;
  setAt: Date;
};

export type LeadValueAuditWrite = {
  workspaceId: string;
  oldLeadCents: number | null;
  newLeadCents: number | null;
  oldCallCents: number | null;
  newCallCents: number | null;
  userId: string;
  setAt: Date;
};

/** Settings and an audit row only. There is no budget or ad-account method on this store. */
export type LeadValueStore = {
  read(workspaceId: string): Promise<LeadValueSnapshot | null>;
  write(workspaceId: string, row: LeadValueWrite): Promise<void>;
  audit(row: LeadValueAuditWrite): Promise<void>;
};

export async function saveClientLeadValue(
  actor: { kind: string; workspaceId: string; userId: string },
  input: { leadCents: number; callCents: number | null },
  store: LeadValueStore,
  now = new Date(),
) {
  if (!canEditLeadValue({ kind: actor.kind as MarketingAccess["kind"] })) {
    throw new Error("Only a super admin or account manager can set lead value.");
  }
  const workspaceId = actor.workspaceId.trim();
  if (!workspaceId) throw new Error("A workspace is required.");
  if (!Number.isInteger(input.leadCents) || input.leadCents <= 0 || input.leadCents > MAX_CENTS) {
    throw new Error("Enter a lead value greater than $0.");
  }
  if (input.callCents != null && (!Number.isInteger(input.callCents) || input.callCents <= 0 || input.callCents > MAX_CENTS)) {
    throw new Error("Enter a call value greater than $0, or leave it blank.");
  }
  const current = await store.read(workspaceId);
  const oldLead = current?.leadValueCents ?? null;
  const oldCall = current?.callValueCents ?? null;
  if (oldLead === input.leadCents && oldCall === input.callCents) return { changed: false as const };
  await store.write(workspaceId, {
    leadValueCents: input.leadCents,
    callValueCents: input.callCents,
    userId: actor.userId,
    setAt: now,
  });
  await store.audit({
    workspaceId,
    oldLeadCents: oldLead,
    newLeadCents: input.leadCents,
    oldCallCents: oldCall,
    newCallCents: input.callCents,
    userId: actor.userId,
    setAt: now,
  });
  return { changed: true as const };
}

import type { DecisionRecord, DecisionStatus } from "./types";

export const UNDO_MS = 30_000;
export const CARD_TTL_MS = 24 * 60 * 60 * 1000;

export type DecisionAction = "approve" | "decline" | "later" | "undo";

export function stagesReady(kinds: string[]) {
  return kinds.includes("booked") && kinds.includes("sold");
}

export function decisionCardCopy(clientName: string, ready: boolean) {
  return {
    tag: "Conversion feedback",
    tier: "Super admin approves",
    headline: `Turn on conversion feedback for ${clientName}.`,
    fix: ready
      ? "Approve to include this client. Payloads are logged and nothing is sent until the live switch is on."
      : "Map booked and sold before turning this client on.",
    impact: "Booked and sold leads can be matched back to the ads that brought them in.",
    confidence: ready ? "High · 90%" : "Low · 40%",
    evidence: "The stage map, click ids, and hashed email or phone are checked before a payload is logged.",
  };
}

export function undoToast(secondsLeft: number) {
  return `Approved. Undo · ${Math.max(0, Math.ceil(secondsLeft))}s`;
}

export function cardExpiryLabel(expiresAt: string, now: Date) {
  const left = Date.parse(expiresAt) - now.getTime();
  if (left <= 0) return "Expired";
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return `expires in ${hours}h ${minutes}m`;
}

export function newTurnOnDecision(clientId: string, now: Date, id: string): DecisionRecord {
  return {
    id,
    clientId,
    status: "pending",
    expiresAt: new Date(now.getTime() + CARD_TTL_MS).toISOString(),
    decidedById: null,
    decidedAt: null,
    undoUntil: null,
    createdAt: now.toISOString(),
  };
}

function expired(decision: DecisionRecord, now: Date) {
  return Date.parse(decision.expiresAt) <= now.getTime();
}

export function applyDecision(decision: DecisionRecord, action: DecisionAction, now: Date, actorId: string): DecisionRecord {
  if (action === "undo") {
    if (decision.status !== "accepted" || !decision.undoUntil) return decision;
    if (Date.parse(decision.undoUntil) <= now.getTime()) return decision;
    return { ...decision, status: "pending", decidedById: null, decidedAt: null, undoUntil: null };
  }
  if (decision.status !== "pending" || expired(decision, now)) return decision;
  const status: DecisionStatus = action === "approve" ? "accepted" : action === "decline" ? "declined" : "later";
  return {
    ...decision,
    status,
    decidedById: actorId,
    decidedAt: now.toISOString(),
    undoUntil: action === "approve" ? new Date(now.getTime() + UNDO_MS).toISOString() : null,
  };
}

/** The client stays off until this returns enable: true. Approve alone does not enable. */
export function finalizeDecision(decision: DecisionRecord, now: Date) {
  if (decision.status !== "accepted" || !decision.undoUntil) return { decision, enable: false };
  if (Date.parse(decision.undoUntil) > now.getTime()) return { decision, enable: false };
  return { decision: { ...decision, undoUntil: null }, enable: true };
}

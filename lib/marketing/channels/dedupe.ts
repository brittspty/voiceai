import { createHash } from "node:crypto";

export const DEFAULT_CLICK_CREDIT_DAYS = 7;
export const DEFAULT_VIEW_CREDIT_DAYS = 1;

export type CreditWindow = {
  clickDays: number;
  viewDays: number;
};

export type LeadTouchKind = "click" | "view" | "direct";

export type LeadTouch = {
  personKey: string;
  channel: string;
  touch: LeadTouchKind;
  touchedAt: string;
  leadAt: string;
  qualified?: boolean;
  booked?: boolean;
};

export type DedupeResult = {
  people: number;
  qualified: number;
  booked: number;
  byChannel: Record<string, number>;
  platformClaims: Record<string, number>;
  window: CreditWindow;
};

export function defaultCreditWindow(): CreditWindow {
  return { clickDays: DEFAULT_CLICK_CREDIT_DAYS, viewDays: DEFAULT_VIEW_CREDIT_DAYS };
}

export function creditWindow(input?: Partial<CreditWindow> | null): CreditWindow {
  const clickDays = input?.clickDays;
  const viewDays = input?.viewDays;
  return {
    clickDays: Number.isFinite(clickDays) && (clickDays as number) >= 0 ? Math.floor(clickDays as number) : DEFAULT_CLICK_CREDIT_DAYS,
    viewDays: Number.isFinite(viewDays) && (viewDays as number) >= 0 ? Math.floor(viewDays as number) : DEFAULT_VIEW_CREDIT_DAYS,
  };
}

export function hashIdentity(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Phone wins over email. The stored key is a hash, not the raw value. */
export function personKey(input: { phone?: string | null; email?: string | null }) {
  const phone = (input.phone || "").replace(/\D/g, "");
  if (phone) return `p:${hashIdentity(phone)}`;
  const email = (input.email || "").trim().toLowerCase();
  if (email) return `e:${hashIdentity(email)}`;
  return null;
}

function ageDays(leadAt: string, touchedAt: string) {
  const lead = Date.parse(leadAt);
  const touch = Date.parse(touchedAt);
  if (!Number.isFinite(lead) || !Number.isFinite(touch)) return null;
  return (lead - touch) / 86_400_000;
}

export function touchCredited(touch: LeadTouch, window: CreditWindow) {
  const age = ageDays(touch.leadAt, touch.touchedAt);
  if (age == null || age < 0) return false;
  if (touch.touch === "click") return age <= window.clickDays;
  if (touch.touch === "view") return age <= window.viewDays;
  return touch.touch === "direct";
}

/**
 * Last non-direct touch inside the credit window.
 * A person claimed by two channels counts once in the blended total.
 */
export function dedupeLeads(touches: LeadTouch[], windowInput?: Partial<CreditWindow> | null): DedupeResult {
  const window = creditWindow(windowInput);
  const claims: Record<string, number> = {};
  const grouped = new Map<string, LeadTouch[]>();
  for (const touch of touches) {
    if (!touch.personKey) continue;
    if (touch.touch !== "direct") claims[touch.channel] = (claims[touch.channel] ?? 0) + 1;
    const list = grouped.get(touch.personKey) ?? [];
    list.push(touch);
    grouped.set(touch.personKey, list);
  }
  const byChannel: Record<string, number> = {};
  let qualified = 0;
  let booked = 0;
  for (const list of grouped.values()) {
    const credited = list.filter((touch) => touchCredited(touch, window));
    if (!credited.length) continue;
    const nondirect = credited.filter((touch) => touch.touch !== "direct");
    const pool = nondirect.length ? nondirect : credited;
    const winner = [...pool].sort((a, b) => Date.parse(b.touchedAt) - Date.parse(a.touchedAt) || a.channel.localeCompare(b.channel))[0];
    if (!winner) continue;
    byChannel[winner.channel] = (byChannel[winner.channel] ?? 0) + 1;
    if (credited.some((touch) => touch.qualified)) qualified += 1;
    if (credited.some((touch) => touch.booked)) booked += 1;
  }
  const people = Object.values(byChannel).reduce((sum, count) => sum + count, 0);
  return { people, qualified, booked, byChannel, platformClaims: claims, window };
}

export function attributionNote(window: CreditWindow = defaultCreditWindow()) {
  return `Last non-direct touch, ${window.clickDays}-day click / ${window.viewDays}-day view. Platform-reported numbers may be higher because each platform claims its own leads.`;
}

export function creditWindowLabel(input: { clickDays: number; viewDays: number; learnedClickDays?: number | null; learnedViewDays?: number | null }) {
  if (input.learnedClickDays != null && input.learnedClickDays > 0) {
    const view = input.learnedViewDays != null && input.learnedViewDays > 0 ? ` / ${input.learnedViewDays}-day view` : "";
    return `Credit window: ${input.learnedClickDays}-day click${view} (learned)`;
  }
  return `Credit window: ${input.clickDays}-day click / ${input.viewDays}-day view`;
}

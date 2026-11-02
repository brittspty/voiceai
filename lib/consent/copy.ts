import { createHash } from "node:crypto";

/**
 * Visitor-facing consent copy. One file.
 * Modeled on Concord's purpose ladder (strictly necessary, functional, analytics, advertising)
 * as three levels plus reject. This is our widget. It does not call Concord and it loads no vendor SDK.
 * Every visitor-facing line is marked DRAFT until legal review replaces it.
 * Bump CONSENT_WORDING_VERSION when any line changes so older records keep their own version row.
 */
export const CONSENT_WORDING_VERSION = "draft-2026-11-02";

export const CONSENT_COPY = {
  marker: "DRAFT",
  banner: "DRAFT — pending legal review",
  title: "DRAFT — Diver AI consent",
  intro:
    "DRAFT, pending legal review. Diver AI stores this choice. Strictly necessary storage keeps the choice itself. Analytics and advertising tags stay off until you pick a level that allows them.",
  lowTitle: "DRAFT Low",
  lowBody: "DRAFT. Functional only. Remembers this choice. Does not load analytics or advertising tags.",
  mediumTitle: "DRAFT Medium",
  mediumBody: "DRAFT. Functional and analytics. Measurement tags may load. Advertising pixels stay off.",
  highTitle: "DRAFT High",
  highBody: "DRAFT. Functional, analytics, and advertising. Diver AI pixels and advertising tags may load.",
  rejectTitle: "DRAFT Reject",
  rejectBody: "DRAFT. Only the storage needed to remember this refusal. No analytics and no advertising tags.",
  change: "DRAFT. You can change this choice. The newest choice is the one we keep.",
  withdraw: "DRAFT. You can withdraw this choice. Withdrawal is stored as a new record, and it replaces the earlier one.",
  footnote: "DRAFT pending legal review. This is not a final privacy notice.",
} as const;

export function draftBanner() {
  return CONSENT_COPY.banner;
}

/** Canonical text of the wording version. The log stores this hash and the version row stores this text. */
export function exactWordingText() {
  return JSON.stringify({ version: CONSENT_WORDING_VERSION, copy: CONSENT_COPY });
}

export function wordingHash(text = exactWordingText()) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

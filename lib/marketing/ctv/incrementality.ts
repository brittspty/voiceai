import { hashBucket } from "../holdouts";

export const HOLDOUT_PERCENT = 10;
const Z95 = 1.959963984540054;

export type HoldoutRole = "exposed" | "holdout";

export type HoldoutAssignment = {
  maidListId: string;
  householdId: string;
  role: HoldoutRole;
};

/**
 * 10% household holdout per MAID audience, chosen before upload.
 * Dry run only. Nothing is uploaded or excluded on the platform.
 */
export function planMaidHoldout(input: { maidListId: string; householdIds: string[]; percent?: number; upload?: boolean }) {
  if (input.upload) {
    throw new Error("Holdout selection is a dry run. Nothing is uploaded or excluded on the platform.");
  }
  const percent = input.percent ?? HOLDOUT_PERCENT;
  if (!Number.isInteger(percent) || percent < 1 || percent > 50) {
    throw new Error("Holdout percent must be between 1 and 50.");
  }
  const ids = [...new Set(input.householdIds.map((id) => id.trim()).filter(Boolean))].sort();
  const assignments: HoldoutAssignment[] = ids.map((householdId) => ({
    maidListId: input.maidListId,
    householdId,
    role: hashBucket(input.maidListId, householdId) < percent ? "holdout" : "exposed",
  }));
  return { percent, uploaded: false as const, writesPlatform: false as const, assignments };
}

export type LiftResult = {
  incremental: boolean;
  source: "household_holdout" | "ghost_bid" | "psa" | "none";
  label: string;
  lift: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  exposedCvr: number | null;
  holdoutCvr: number | null;
};

function difference(exposedVerified: number, exposedHouseholds: number, holdoutVerified: number, holdoutHouseholds: number) {
  const exposedCvr = exposedVerified / exposedHouseholds;
  const holdoutCvr = holdoutVerified / holdoutHouseholds;
  const lift = exposedCvr - holdoutCvr;
  const se = Math.sqrt((exposedCvr * (1 - exposedCvr)) / exposedHouseholds + (holdoutCvr * (1 - holdoutCvr)) / holdoutHouseholds);
  return { lift, ciLow: lift - Z95 * se, ciHigh: lift + Z95 * se, exposedCvr, holdoutCvr };
}

export function incrementalLift(input: {
  exposedHouseholds: number;
  exposedVerified: number;
  holdoutHouseholds: number;
  holdoutVerified: number;
  ghostOrPsa?: { kind: "ghost_bid" | "psa"; exposedCvr: number; controlCvr: number; exposedTrials?: number; controlTrials?: number } | null;
}): LiftResult {
  if (input.exposedHouseholds > 0 && input.holdoutHouseholds > 0) {
    const diff = difference(input.exposedVerified, input.exposedHouseholds, input.holdoutVerified, input.holdoutHouseholds);
    return { incremental: true, source: "household_holdout", label: "incremental", ...diff };
  }
  const control = input.ghostOrPsa;
  if (control && (control.exposedTrials ?? 0) > 0 && (control.controlTrials ?? 0) > 0) {
    const diff = difference(
      control.exposedCvr * (control.exposedTrials ?? 0),
      control.exposedTrials ?? 0,
      control.controlCvr * (control.controlTrials ?? 0),
      control.controlTrials ?? 0,
    );
    return {
      incremental: true,
      source: control.kind,
      label: control.kind === "psa" ? "PSA control" : "ghost-bid control",
      ...diff,
    };
  }
  if (control) {
    const lift = control.exposedCvr - control.controlCvr;
    return {
      incremental: true,
      source: control.kind,
      label: control.kind === "psa" ? "PSA control" : "ghost-bid control",
      lift,
      ciLow: null,
      ciHigh: null,
      exposedCvr: control.exposedCvr,
      holdoutCvr: control.controlCvr,
    };
  }
  return {
    incremental: false,
    source: "none",
    label: "attributed, not incremental",
    lift: null,
    ciLow: null,
    ciHigh: null,
    exposedCvr: null,
    holdoutCvr: null,
  };
}

export function recommendFromLift(lift: LiftResult): "scale" | "test" | "cut" | null {
  if (!lift.incremental || lift.lift == null) return null;
  if (lift.ciLow == null || lift.ciHigh == null) return "test";
  if (lift.ciLow > 0) return "scale";
  if (lift.ciHigh < 0) return "cut";
  return "test";
}

export function costPerIncremental(spend: number, lift: number | null, exposedHouseholds: number) {
  if (lift == null || lift <= 0 || exposedHouseholds <= 0 || spend <= 0) return null;
  const extra = lift * exposedHouseholds;
  if (extra <= 0) return null;
  return spend / extra;
}

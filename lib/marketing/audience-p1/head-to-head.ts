import { forReader, type P1Reader } from "../p1-reader";
import { resolveSegmentSettings } from "../segments/settings";
import { judgeArms } from "../segments/stats";
import { AUDIENCE_P1_THRESHOLDS } from "./thresholds";

const settings = resolveSegmentSettings();

export type TestStatus = "still_learning" | "winner" | "no_clear_winner" | "stopped";

type ArmInput = {
  key: string;
  publicLabel: string;
  vendor: string;
  listId: string;
  successes: number;
  trials: number;
  days: number;
  quality: number;
};

type Fixture = {
  id: string;
  stopped: boolean;
  match: { platform: string; rate: number }[];
  arms: [ArmInput, ArmInput];
};

const FIXTURES: Fixture[] = [
  {
    id: "learning",
    stopped: false,
    match: [
      { platform: "Example Platform A", rate: 0.22 },
      { platform: "Example Platform B", rate: 0.55 },
    ],
    arms: [
      { key: "learn-a", publicLabel: "Example list A", vendor: "Example Vendor", listId: "ex-learn-a", successes: 40, trials: 200, days: 4, quality: 50 },
      { key: "learn-b", publicLabel: "Example list B", vendor: "Sample Vendor", listId: "ex-learn-b", successes: 30, trials: 200, days: 4, quality: 50 },
    ],
  },
  {
    id: "winner",
    stopped: false,
    match: [
      { platform: "Example Platform A", rate: 0.62 },
      { platform: "Example Platform B", rate: 0.48 },
    ],
    arms: [
      { key: "win", publicLabel: "Example list A", vendor: "Example Vendor", listId: "ex-win", successes: 220, trials: 500, days: 10, quality: 80 },
      { key: "lose", publicLabel: "Example list B", vendor: "Sample Vendor", listId: "ex-lose", successes: 110, trials: 500, days: 10, quality: 55 },
    ],
  },
  {
    id: "no-clear",
    stopped: false,
    match: [
      { platform: "Example Platform A", rate: 0.51 },
      { platform: "Example Platform B", rate: 0.44 },
    ],
    arms: [
      { key: "tie-a", publicLabel: "Example list A", vendor: "Example Vendor", listId: "ex-tie-a", successes: 150, trials: 800, days: 28, quality: 60 },
      { key: "tie-b", publicLabel: "Example list B", vendor: "Sample Vendor", listId: "ex-tie-b", successes: 148, trials: 800, days: 28, quality: 60 },
    ],
  },
  {
    id: "stopped",
    stopped: true,
    match: [
      { platform: "Example Platform A", rate: 0.62 },
      { platform: "Example Platform B", rate: 0.48 },
    ],
    arms: [
      { key: "stop-a", publicLabel: "Example list A", vendor: "Example Vendor", listId: "ex-stop-a", successes: 220, trials: 500, days: 10, quality: 80 },
      { key: "stop-b", publicLabel: "Example list B", vendor: "Sample Vendor", listId: "ex-stop-b", successes: 110, trials: 500, days: 10, quality: 55 },
    ],
  },
];

export function checklistFor(input: { probability: number | null; pValue: number | null; arms: { successes: number; days: number }[] }) {
  const rules = AUDIENCE_P1_THRESHOLDS;
  return [
    { id: "probability", text: "Probability to beat the best is at least 95%", met: (input.probability ?? 0) >= rules.probabilityToBeatBest },
    { id: "p-value", text: "Two-proportion p-value is under 0.05", met: input.pValue != null && input.pValue < rules.twoProportionAlpha },
    { id: "conversions", text: "At least 100 verified-human conversions on each arm", met: input.arms.every((arm) => arm.successes >= rules.minConversionsPerArm) },
    { id: "days", text: "The test has run at least 7 days", met: input.arms.every((arm) => arm.days >= rules.minDays) },
  ];
}

export function cutAllowed(arm: { successes: number; days: number }) {
  return arm.successes >= AUDIENCE_P1_THRESHOLDS.minConversionsPerArm && arm.days >= AUDIENCE_P1_THRESHOLDS.minDays;
}

export function isLowMatch(rates: { rate: number }[]) {
  return rates.some((row) => row.rate < AUDIENCE_P1_THRESHOLDS.lowMatchRate);
}

const STATUS_LABEL: Record<TestStatus, string> = {
  still_learning: "Still learning",
  winner: "Winner found",
  no_clear_winner: "No clear winner",
  stopped: "Stopped",
};

function statusFor(fixture: Fixture, judgmentStatus: "still_learning" | "winner" | "no_clear_winner", checklistMet: boolean): TestStatus {
  if (fixture.stopped) return "stopped";
  if (judgmentStatus === "winner" && checklistMet) return "winner";
  if (judgmentStatus === "no_clear_winner") return "no_clear_winner";
  return "still_learning";
}

export function evaluateFixture(fixture: Fixture) {
  const judgment = judgeArms(
    fixture.arms.map((arm) => ({ key: arm.key, successes: arm.successes, trials: arm.trials, days: arm.days, quality: arm.quality })),
    settings,
    null,
  );
  const leader = [...fixture.arms].sort((a, b) => b.successes / b.trials - a.successes / a.trials)[0];
  const probability = leader ? judgment.probabilities[leader.key] ?? 0 : 0;
  const checklist = checklistFor({ probability, pValue: judgment.pValue, arms: fixture.arms });
  const status = statusFor(fixture, judgment.status, checklist.every((line) => line.met));
  const onHold = isLowMatch(fixture.match);
  return { judgment, probability, checklist, status, onHold, leaderKey: leader?.key ?? "" };
}

export function presentTests(reader: P1Reader) {
  const tests = FIXTURES.map((fixture) => {
    const evaluated = evaluateFixture(fixture);
    const staff = reader === "staff";
    return {
      id: fixture.id,
      status: evaluated.status,
      label: STATUS_LABEL[evaluated.status],
      dayLabel: evaluated.status === "no_clear_winner" ? "Day 28" : "",
      onHold: evaluated.onHold,
      holdLabel: evaluated.onHold ? (staff ? "On hold: low match rate" : "On hold") : "",
      checklist: evaluated.checklist,
      summary: summaryFor(evaluated.status, staff),
      adAccountWrite: false as const,
      ...(staff ? { platformMatch: fixture.match.map((row) => ({ platform: row.platform, percent: Math.round(row.rate * 100) })) } : {}),
      arms: fixture.arms.map((arm) => ({
        key: arm.key,
        label: staff ? `${arm.vendor} · ${arm.publicLabel}` : arm.publicLabel,
        successes: arm.successes,
        trials: arm.trials,
        days: arm.days,
        rateLabel: `${((arm.successes / arm.trials) * 100).toFixed(1)}%`,
        canCut: cutAllowed(arm),
        winner: evaluated.status === "winner" && arm.key === evaluated.leaderKey,
        ...(staff ? { vendor: arm.vendor, listId: arm.listId } : {}),
      })),
    };
  });
  return forReader(
    {
      exampleData: true as const,
      banner: "EXAMPLE DATA",
      title: "Head-to-head",
      basedOn: reader === "staff"
        ? "Based on: EXAMPLE DATA. MAID lists compared with each other. Verified-human conversions only."
        : "Based on: EXAMPLE DATA. Lists compared with each other. Verified-human conversions only.",
      lockedNote: reader === "staff"
        ? "Winner needs at least 95% probability to beat the best, p under 0.05, 100 verified-human conversions on each arm, and 7 days. Cut only after that sample. A platform under 30% match rate is on hold."
        : "A winner needs a high chance of being best, a passed check, 100 verified-human conversions on each list, and 7 days. Cut only after that sample. One platform is on hold until the match is high enough.",
      manualNote: "Scale and cut only log a choice and show the manual steps. No write access approved.",
      tests,
    },
    reader,
  );
}

function summaryFor(status: TestStatus, staff: boolean) {
  if (status === "winner") {
    return staff
      ? "Example Vendor list ex-win beat the other list. Shift the audience by hand. The campaign amount stays where a person set it."
      : "This list is ahead. Your account manager may focus more people here. The campaign amount stays where a person set it.";
  }
  if (status === "no_clear_winner") return "No clear winner. The test reached day 28 without a winner.";
  if (status === "stopped") return "Stopped. A person ended this test. The checklist is not a go-ahead.";
  return staff
    ? "Still learning. The checklist is not met yet, and one platform is under 30% match rate."
    : "Still learning. There is not a winner yet.";
}

export function fixtureById(id: string) {
  return FIXTURES.find((fixture) => fixture.id === id) ?? null;
}

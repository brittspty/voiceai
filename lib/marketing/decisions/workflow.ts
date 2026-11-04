import { budgetSteps } from "./rules";

export type DecisionAction = "approve" | "dismiss" | "snooze" | "resolve";

export type DecisionAuditWrite = {
  recommendationId: string;
  action: DecisionAction;
  reason: string;
  note: string;
  snoozeUntil: string | null;
  userId: string;
  at: string;
};

export type DecisionPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      executes: false;
      budgetWrite: "none";
      platformWrite: false;
      writesAds: false;
      changesSpend: false;
      status: "accepted" | "dismissed" | "verified" | "resolved";
      snoozedUntil: string | null;
      decisionNote: string;
      steps: string[];
      audit: DecisionAuditWrite;
    };

const STEPS = {
  ctr_drift: [
    "Open this campaign in the ad platform.",
    "Compare click rate for the last 14 days with the 14 days before.",
    "Refresh the creative or the audience if the drop is real.",
    "Nothing on this screen changes the campaign.",
  ],
  conversion_drift: [
    "Open this campaign in the ad platform.",
    "Compare the conversion rate for the last 14 days with the 14 days before.",
    "Check the landing page and the conversion action.",
    "Nothing on this screen changes the campaign.",
  ],
  conversion_gap: [
    "Confirm the pixel or conversion action is still firing.",
    "Open a landing page from this campaign and submit a test.",
    "Check that clicks are reaching the page.",
    "Nothing on this screen changes tracking or the campaign.",
  ],
  conversion_gap_client: [
    "Confirm the pixel or conversion action is still firing.",
    "Open a landing page and submit a test.",
    "Check that clicks are reaching the page.",
    "Nothing on this screen changes tracking.",
  ],
  stale_campaign: [
    "Confirm this campaign is still supposed to be active.",
    "Look for a delivery, billing, or policy hold in the ad platform.",
    "Nothing on this screen pauses or restarts the campaign.",
  ],
  ctv_frequency: [
    "In the CTV platform, set a frequency cap of 3 to 4 impressions per household per week.",
    "Nothing on this screen changes the cap.",
  ],
  ctv_outlier: [
    "Review this app or publisher against the client average.",
    "Exclude it in the ad platform if the visit rate stays low.",
    "Nothing on this screen changes targeting.",
  ],
  budget_change: budgetSteps(),
  pacing: budgetSteps(),
  roi: budgetSteps(),
  ad_underperformance: [
    "Review the ads listed in the evidence.",
    "Pause or replace the weak ads in the ad platform.",
    "Nothing on this screen changes those ads.",
  ],
};

export function stepsFor(rule: string, evidence?: unknown) {
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    const steps = (evidence as { steps?: unknown }).steps;
    if (Array.isArray(steps) && steps.every((step) => typeof step === "string") && steps.length) return steps as string[];
  }
  const known = STEPS as Record<string, string[] | undefined>;
  const key = rule.startsWith("ad_alert:") ? "ad_underperformance" : rule;
  return known[key] ?? [
    "Review the evidence, then make the change in the ad platform.",
    "Nothing on this screen changes the campaign.",
  ];
}

/**
 * Approve, dismiss, or snooze. The result is an audit row and a status.
 * Approving does not spend, change a budget, or call an ad platform.
 */
export function planDecision(input: {
  recommendationId: string;
  action: DecisionAction;
  reason?: string;
  note?: string;
  snoozeUntil?: string;
  today: string;
  userId: string;
  at: string;
  rule: string;
  evidence?: unknown;
}): DecisionPlan {
  const reason = (input.reason || "").trim();
  const note = (input.note || "").trim();
  if (!input.userId.trim()) return { ok: false, error: "A person is required." };
  if (!input.recommendationId.trim()) return { ok: false, error: "A decision is required." };
  let snoozedUntil: string | null = null;
  if (input.action === "dismiss" && !reason) return { ok: false, error: "A reason is required to dismiss." };
  if (input.action === "resolve" && !note) return { ok: false, error: "Say what was done." };
  if (input.action === "snooze") {
    const until = (input.snoozeUntil || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: "Choose a date to snooze until." };
    if (until < input.today) return { ok: false, error: "Choose today or a later date." };
    snoozedUntil = until;
  }
  const status = input.action === "approve" ? "accepted" : input.action === "dismiss" ? "dismissed" : input.action === "resolve" ? "resolved" : "verified";
  const steps = input.action === "approve" ? stepsFor(input.rule, input.evidence) : [];
  return {
    ok: true,
    executes: false,
    budgetWrite: "none",
    platformWrite: false,
    writesAds: false,
    changesSpend: false,
    status,
    snoozedUntil,
    decisionNote: input.action === "approve" ? note || "approved" : input.action === "dismiss" ? reason : input.action === "resolve" ? note : "",
    steps,
    audit: {
      recommendationId: input.recommendationId,
      action: input.action,
      reason: input.action === "dismiss" ? reason : reason,
      note,
      snoozeUntil: snoozedUntil,
      userId: input.userId,
      at: input.at,
    },
  };
}

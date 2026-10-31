import { creditWindowLabel, type CreditWindow } from "./dedupe";

export type RecAction = "serve" | "rotate" | "pause";

export type AdRecommendation = {
  action: RecAction | "insufficient";
  label: string;
  reason: string;
  confidence: number;
  confidenceLabel: string;
  creditWindowLabel: string;
  creditSource: "learned" | "default";
  decisionId: string | null;
  executes: false;
  writePath: null;
};

export type AdSignal = {
  name: string;
  leads: number;
  clicksChangePct: number | null;
  frequency: number | null;
  confidence: number;
  rising?: boolean;
  decisionId: string;
  productName: string;
  credit: CreditWindow & { learnedClickDays?: number | null; learnedViewDays?: number | null; source?: "learned" | "default" };
};

function band(confidence: number) {
  if (confidence >= 80) return "High";
  if (confidence >= 60) return "Medium";
  return "Low";
}

/** Every ad gets a recommendation. Pause never calls an ads API. */
export function recommendAd(input: AdSignal): AdRecommendation {
  const source = input.credit.source ?? (input.credit.learnedClickDays ? "learned" : "default");
  const windowLabel = creditWindowLabel({
    clickDays: input.credit.clickDays,
    viewDays: input.credit.viewDays,
    learnedClickDays: source === "learned" ? input.credit.learnedClickDays ?? input.credit.clickDays : null,
    learnedViewDays: source === "learned" ? input.credit.learnedViewDays ?? input.credit.viewDays : null,
  });
  if (input.confidence < 60) {
    return {
      action: "insufficient",
      label: "Not enough data",
      reason: "Not enough data",
      confidence: input.confidence,
      confidenceLabel: "Not enough data",
      creditWindowLabel: windowLabel,
      creditSource: source,
      decisionId: null,
      executes: false,
      writePath: null,
    };
  }
  const confidenceLabel = `${band(input.confidence)} confidence ${input.confidence}%`;
  if (input.leads <= 0) {
    return {
      action: "pause",
      label: "PAUSE · RECOMMENDATION",
      reason: `Pause (your call): 0 leads across the credit window. ${input.productName} will not pause it.`,
      confidence: input.confidence,
      confidenceLabel,
      creditWindowLabel: windowLabel,
      creditSource: source,
      decisionId: input.decisionId,
      executes: false,
      writePath: null,
    };
  }
  const tired = (input.frequency ?? 0) > 3.5 || (input.clicksChangePct != null && input.clicksChangePct <= -25);
  if (tired) {
    const clicks = input.clicksChangePct == null ? "clicks are down" : `clicks down ${Math.abs(Math.round(input.clicksChangePct))}% over 5 days`;
    const seen = input.frequency == null ? "people have seen it often" : `people have seen it ${input.frequency.toFixed(1)} times on average`;
    return {
      action: "rotate",
      label: "ROTATE",
      reason: `Rotate: ${clicks} and ${seen}, so it's wearing out.`,
      confidence: input.confidence,
      confidenceLabel,
      creditWindowLabel: windowLabel,
      creditSource: source,
      decisionId: input.decisionId,
      executes: false,
      writePath: null,
    };
  }
  return {
    action: "serve",
    label: "SERVE",
    reason: input.rising ? `Serve: cheapest lead here and clicks rising.` : `Serve: results are holding against this ad's own trend.`,
    confidence: input.confidence,
    confidenceLabel,
    creditWindowLabel: windowLabel,
    creditSource: source,
    decisionId: input.decisionId,
    executes: false,
    writePath: null,
  };
}

import { chooseControlList, maidTestArms } from "../audience-source";
import { buildProvenance } from "../provenance";
import { nextDrill } from "./drill";
import { presentBoard, type AudienceMode, type BoardRowInput, type BoardSort } from "./present";
import { recommendLists, type ListCandidate } from "./recommend";
import { SEGMENT_ENGINE_V1, resolveSegmentSettings } from "./settings";
import { judgeArms } from "./stats";

const settings = resolveSegmentSettings();

type RawList = ListCandidate & {
  name: string;
  parent: string;
  audienceSource: "maid_market";
  matchRates: { platform: string; rate: number }[];
  qualityProvisional: boolean;
  revenue: number | null;
  spend: number | null;
};

const RAW: RawList[] = [
  {
    key: "implant",
    name: "Implant seekers 55+, Tampa Bay",
    parent: "Retirees FL",
    audienceSource: "maid_market",
    vendor: "Allsource",
    listId: "implant-55-tampa",
    matchRates: [{ platform: "meta", rate: 0.62 }, { platform: "google_ads", rate: 0.48 }],
    subSegmentKey: "tampa-bay",
    people: 8000,
    successes: 960,
    trials: 8000,
    days: 14,
    quality: 82,
    qualityProvisional: false,
    revenue: 38200,
    spend: 29760,
  },
  {
    key: "emergency",
    name: "Emergency dentist searchers, after 6 PM",
    parent: "Emergency",
    audienceSource: "maid_market",
    vendor: "LiveRamp",
    listId: "emergency-6pm",
    matchRates: [{ platform: "meta", rate: 0.44 }, { platform: "google_ads", rate: 0.22 }],
    subSegmentKey: "after-6pm",
    people: 8000,
    successes: 800,
    trials: 8000,
    days: 14,
    quality: 74,
    qualityProvisional: false,
    revenue: 21600,
    spend: 30400,
  },
  {
    key: "broad",
    name: "Broad 35–54, all of Florida",
    parent: "Prospecting",
    audienceSource: "maid_market",
    vendor: "Allsource",
    listId: "broad-3554-fl",
    matchRates: [{ platform: "meta", rate: 0.51 }, { platform: "google_ads", rate: 0.18 }],
    subSegmentKey: "florida",
    people: 8000,
    successes: 160,
    trials: 8000,
    days: 14,
    quality: 28,
    qualityProvisional: false,
    revenue: 1200,
    spend: 15360,
  },
  {
    key: "spanish",
    name: "Spanish-language, Hillsborough",
    parent: "Retirees FL",
    audienceSource: "maid_market",
    vendor: "Allsource",
    listId: "spanish-hillsborough",
    matchRates: [{ platform: "meta", rate: 0.4 }, { platform: "google_ads", rate: 0.36 }],
    subSegmentKey: "hillsborough",
    people: 900,
    successes: 40,
    trials: 900,
    days: 4,
    quality: 60,
    qualityProvisional: true,
    revenue: null,
    spend: 1760,
  },
];

export function exampleLists() {
  const judged = recommendLists(RAW, settings, null);
  const byKey = new Map(judged.rows.map((row) => [row.key, row]));
  const inputs: BoardRowInput[] = RAW.map((row) => ({
    ...row,
    recommendation: byKey.get(row.key)!,
    required: judged.judgment.requiredConversions,
  }));
  return { settings, judged, inputs };
}

export function exampleBoard(mode: AudienceMode, sort: BoardSort = "conversion", ghlClosedDealSync = false, audienceSource?: string) {
  const { inputs } = exampleLists();
  return presentBoard({ rows: inputs, mode, sort, ghlClosedDealSync, example: true, audienceSource });
}

export function exampleControl() {
  const control = chooseControlList(
    RAW.map((row) => ({
      audienceSource: "maid_market" as const,
      listId: row.listId,
      vendor: row.vendor,
      conversionRate: row.successes / row.trials,
      quality: row.quality,
    })),
  );
  if (!control) throw new Error("Example control missing.");
  const treatment = RAW.find((row) => row.listId !== control.listId)!;
  const built = maidTestArms({
    treatment,
    control: { ...control, subSegmentKey: RAW.find((row) => row.listId === control.listId)?.subSegmentKey },
  });
  const arms = built.arms.map((arm) => {
    const source = RAW.find((row) => row.listId === arm.listId)!;
    return { key: arm.role, successes: source.successes, trials: source.trials, days: source.days, quality: source.quality, arm };
  });
  return { kind: built.kind, arms, judgment: judgeArms(arms, settings, null), settings: SEGMENT_ENGINE_V1 };
}

export function exampleDrill() {
  const { inputs, judged } = exampleLists();
  const parentRow = inputs.find((row) => row.recommendation.winner) ?? inputs[0]!;
  return nextDrill({
    parent: {
      key: parentRow.key,
      successes: parentRow.successes,
      trials: parentRow.trials,
      days: parentRow.days,
      quality: parentRow.quality,
      people: parentRow.people,
    },
    parentWon: Boolean(parentRow.recommendation.winner) || judged.judgment.winnerKey === parentRow.key,
    level: "geo",
    buckets: [
      { key: "brandon", attribute: "zip", value: "Within 8 miles of the Brandon office", successes: 320, trials: 1800, days: 14, quality: 84 },
      { key: "pinellas", attribute: "zip", value: "Pinellas County", successes: 40, trials: 700, days: 14, quality: 50 },
      { key: "ages", attribute: "age_band", value: "Ages 62–70", successes: 280, trials: 1600, days: 14, quality: 80 },
      { key: "stories", attribute: "age_band", value: "Ages 25–34", successes: 110, trials: 2200, days: 14, quality: 40 },
    ],
    settings,
    baselineRate: null,
    consent: false,
    contributingClients: 1,
    crossClient: false,
  });
}

export function exampleProvenance() {
  return buildProvenance([
    { sourceId: "crm", sourceLabel: "CRM closed deals", metricKey: "revenue", trustTier: "crm", truthRole: "ground_truth" },
    { sourceId: "maid", sourceLabel: "MAID audience", metricKey: "conversions", trustTier: "proprietary", truthRole: "audience", vendor: "Allsource", listId: "implant-55-tampa" },
    { sourceId: "platform", sourceLabel: "Platform export", metricKey: "spend", trustTier: "platform_reported", truthRole: "delivery_only" },
  ]);
}

export function exampleLineage() {
  return [
    { level: "Source", label: "MAID market", detail: "Allsource", listId: "implant-55-tampa", vendor: "Allsource", count: 118, share: 0.56 },
    { level: "Segment", label: "Retirees FL", detail: "Campaign", listId: "implant-55-tampa", vendor: "Allsource", count: 82, share: 0.69 },
    { level: "Sub-segment", label: "Implant seekers 55+", detail: "Ad set", listId: "implant-55-tampa", vendor: "Allsource", count: 64, share: 0.78 },
    { level: "Audience", label: "Tampa Bay, 25-mile", detail: "Audience", listId: "implant-55-tampa", vendor: "Allsource", count: 51, share: 0.8 },
  ];
}

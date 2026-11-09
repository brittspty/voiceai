import { AdBudgetWriteBlockedError, assertNoAdBudgetWrite } from "../marketing/connectors/budget-lock";
import { attributeConversions, type ConversionDraft } from "../marketing/audiences/pixel";
import { GOOGLE_POLICY_WARNING, incrementalLift, listValidationFlags, type ListFlag } from "../marketing/audiences/list-validation";
import { DEMO_FACTS, DEMO_LIST, DEMO_STALE_LIST } from "./dataset";

/**
 * Walkthrough facts for the demo screens.
 * Research figures are published statistics with a source and a date.
 * Every account number is sample data. Specificity company figures stay placeholders.
 */

export const RESEARCH_BADGE = "PUBLISHED RESEARCH · NOT A SPECIFICITY RESULT";
export const SAMPLE_BADGE = "ILLUSTRATIVE DEMO DATA";
export const SPECIFICITY_FIGURE = "[Specificity figure]";

export const PROBLEM_FRAME =
  "Unprotected, platform-guessed buying is where non-human traffic shows up. These publishers measure different things. Do not add the figures together. None of them is a Specificity result.";

export const PROBLEM_LIMIT =
  "What ships today is a traceable list, a conversion that has to pass a contact check, and a budget write a bot cannot send. Pre-serve bot filtering is not connected, and no verification partner is connected.";

export type ProblemStat = {
  id: string;
  figure: string;
  title: string;
  detail: string;
  scope: string;
  source: string;
  date: string;
};

export const PROBLEM_STATS: ProblemStat[] = [
  {
    id: "thales",
    figure: "53%",
    title: "of web traffic was bots in 2025",
    detail: "Bad bots were 40%. Humans were 47%.",
    scope: "All observed web traffic on the Thales network.",
    source: "Thales 2026 Bad Bot Report",
    date: "April 29, 2026",
  },
  {
    id: "pixalate",
    figure: "25% · 39% · 25%",
    title: "US programmatic invalid traffic",
    detail: "25% desktop and mobile web. 39% mobile app. 25% CTV.",
    scope: "US programmatic open-auction impressions.",
    source: "Pixalate",
    date: "Q2 2026, published August 12, 2026",
  },
  {
    id: "ana",
    figure: "45.1%",
    title: "of programmatic spend reached quality impressions",
    detail: "Viewable, fraud-free, and not made for advertising. Lower performers in the same benchmark were at 31.1%.",
    scope: "ANA benchmark advertisers' log-level programmatic data.",
    source: "ANA / TAG TrustNet / Fiducia",
    date: "Q2 2026, published August 2026",
  },
  {
    id: "doubleverify",
    figure: "2.8% · 0.6%",
    title: "fraud on unprotected and protected campaigns",
    detail: "Unprotected campaigns 2.8%. Protected campaigns 0.6%.",
    scope: "DoubleVerify-monitored campaigns in 2025, measured after the bid.",
    source: "DoubleVerify 2026 Global Insights",
    date: "July 2026",
  },
];

export const DELIVERY_CHANNELS = ["Meta", "Google", "TikTok", "StackAdapt"] as const;

export type DemoChannelPlan = {
  platform: (typeof DELIVERY_CHANNELS)[number];
  vendor: string;
  listId: string;
  uploaded: number;
  matched: number;
  status: string;
  note: string;
};

/** The same sample list, prepared for each delivery channel. Nothing is sent. */
export function demoChannels(): DemoChannelPlan[] {
  return DELIVERY_CHANNELS.map((platform) => ({
    platform,
    vendor: DEMO_LIST.vendor,
    listId: DEMO_LIST.listId,
    uploaded: DEMO_FACTS.fakeMaids,
    matched: DEMO_FACTS.matchedMaids,
    status: "Prepared in this demo. Not sent.",
    note:
      platform === "Google"
        ? `${GOOGLE_POLICY_WARNING} This demo does not upload the list.`
        : "Same sample file on every channel. Not a live match report.",
  }));
}

export type VerifiedRow = {
  id: string;
  label: string;
  status: "verified" | "unverified";
  reason: string;
};

/** Sample conversions run through the product's verified-conversion rule. */
export function demoVerifiedGap() {
  const drafts: ConversionDraft[] = [
    {
      audienceId: "demo-aud-harbor",
      source: "data_market_maid",
      visitorId: "v1",
      externalId: "conv-1",
      kind: "lead",
      qualified: true,
      email: "casey.demo@example.com",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "data_market_maid",
      visitorId: "v1b",
      externalId: "conv-1",
      kind: "lead",
      qualified: true,
      email: "casey.demo@example.com",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "data_market_maid",
      visitorId: "v2",
      externalId: "conv-2",
      kind: "lead",
      qualified: true,
      email: "not-an-email",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "platform_native",
      visitorId: "v3",
      externalId: "conv-3",
      kind: "lead",
      qualified: true,
      email: "riley.demo@example.com",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "platform_native",
      visitorId: "v5",
      externalId: "conv-5",
      kind: "lead",
      qualified: true,
      email: "avery.demo@example.com",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "data_market_maid",
      visitorId: "v4",
      externalId: "conv-4",
      kind: "sale",
      qualified: true,
      email: "quinn.demo@example.com",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "data_market_maid",
      visitorId: "v6",
      externalId: "conv-6",
      kind: "sale",
      qualified: true,
      maid: "11111111-2222-4333-8444-555555555555",
      idType: "idfa",
    },
    {
      audienceId: "demo-aud-harbor",
      source: "data_market_maid",
      visitorId: "v7",
      externalId: "conv-7",
      kind: "lead",
      qualified: true,
      phone: "+15555550111",
    },
  ];
  const labels = [
    "Sample lead from the data-market list, email checked",
    "The same conversion submitted again",
    "Data-market list, contact check failed",
    "Platform-reported lead",
    "Second platform-reported lead",
    "Sample sale from the data-market list, email checked",
    "Sample sale from the data-market list, device id checked",
    "Sample lead from the data-market list, phone checked",
  ];
  const rows: VerifiedRow[] = attributeConversions(drafts).map((row, index) => ({
    id: `${drafts[index]!.externalId}-${index}`,
    label: labels[index] || row.reason,
    status: row.status,
    reason: row.reason,
  }));
  const verified = rows.filter((row) => row.status === "verified").length;
  return { reported: rows.length, verified, gap: rows.length - verified, rows };
}

/** A bot write, judged by the product lock. The recommendation is all that remains. */
export function demoBudgetAttempt() {
  const write = {
    method: "POST",
    url: "https://business-api.tiktok.com/open_api/v1.3/campaign/update/",
    body: { campaign_id: "demo-tiktok-harbor", daily_budget: 18000 },
  };
  let blocked = false;
  let message = "The write was not blocked.";
  try {
    assertNoAdBudgetWrite(write);
  } catch (error) {
    blocked = error instanceof AdBudgetWriteBlockedError;
    message = error instanceof Error ? error.message : "Blocked.";
  }
  return {
    blocked,
    message,
    field: "daily_budget",
    title: "Raise the daily cap on the sample TikTok campaign",
    detail: "Harbor Point Marine (Demo). The weekday marina-owner segment is converting in the seed. This is a recommendation.",
    basedOn: "Harbor Point Marine (Demo), segment Marina owners, weekday",
  };
}

export type VendorCheck = {
  id: string;
  vendor: string;
  listId: string;
  size: number;
  tone: "clear" | "flagged";
  flags: ListFlag[];
};

const VALIDATION_ENV = { LIST_VALIDATION_GATE: "on" };

function vendorFlags(input: {
  id: string;
  vendor: string;
  listId: string;
  size: number;
  seedMatched: number;
  exposedConversions: number;
  exposedSize: number;
  holdoutConversions: number;
  holdoutSize: number;
}): ListFlag[] {
  return listValidationFlags(
    {
      id: input.id,
      listId: input.listId,
      source: "data_market_maid",
      vendor: input.vendor,
      size: input.size,
      consentOrigin: "first_party",
      seedMatched: input.seedMatched,
      platforms: [],
      exposedConversions: input.exposedConversions,
      exposedSize: input.exposedSize,
      holdoutConversions: input.holdoutConversions,
      holdoutSize: input.holdoutSize,
    },
    VALIDATION_ENV,
  );
}

/**
 * Seeded fake-ID checks and a holdout arm.
 * The matched-fake count on the second list is a sample input above the product threshold.
 * Nothing is sent.
 */
export function demoVendorChecks() {
  const honestSize = 1000;
  const flaggedSize = 800;
  const holdout = incrementalLift({
    exposedConversions: 18,
    exposedSize: 180,
    holdoutConversions: 1,
    holdoutSize: 20,
  });
  const sharedHoldout = {
    exposedConversions: 18,
    exposedSize: 180,
    holdoutConversions: 1,
    holdoutSize: 20,
  };
  const honestFlags = vendorFlags({
    id: "demo-vendor-honest",
    vendor: DEMO_LIST.vendor,
    listId: DEMO_LIST.listId,
    size: honestSize,
    seedMatched: 0,
    ...sharedHoldout,
  });
  const flaggedFlags = vendorFlags({
    id: "demo-vendor-flagged",
    vendor: "Gulf Data Desk (Demo)",
    listId: "demo-list-gulf-118",
    size: flaggedSize,
    seedMatched: 8,
    ...sharedHoldout,
  });
  const checks: VendorCheck[] = [
    { id: "honest", vendor: DEMO_LIST.vendor, listId: DEMO_LIST.listId, size: honestSize, tone: "clear", flags: honestFlags },
    { id: "flagged", vendor: "Gulf Data Desk (Demo)", listId: "demo-list-gulf-118", size: flaggedSize, tone: "flagged", flags: flaggedFlags },
  ];
  return {
    checks,
    holdout: {
      exposedSize: sharedHoldout.exposedSize,
      holdoutSize: sharedHoldout.holdoutSize,
      exposedConversions: sharedHoldout.exposedConversions,
      holdoutConversions: sharedHoldout.holdoutConversions,
      message: holdout.message,
      note: "Sample inputs to the holdout math. The holdout saw no ads. This is not a client result.",
    },
    policy: GOOGLE_POLICY_WARNING,
  };
}

export const MARKET_STATS = [
  {
    figure: "$294.6B",
    title: "US internet advertising in 2025",
    detail: "Up 13.9% from the year before.",
    source: "IAB/PwC Internet Ad Revenue Report",
    date: "April 16, 2026",
  },
  {
    figure: "$162.4B",
    title: "US programmatic in 2025",
    detail: "Up 20.5%. Non-search.",
    source: "IAB/PwC Internet Ad Revenue Report",
    date: "April 16, 2026",
  },
] as const;

export const REVENUE_LEVERS = [
  { title: "Audience and MAID sales", body: "Lists sourced in the data market and activated for a client.", figure: SPECIFICITY_FIGURE },
  { title: "Managed media margin", body: "Media run for clients on Meta, Google, TikTok, and StackAdapt.", figure: SPECIFICITY_FIGURE },
  { title: "Platform subscriptions", body: "Access to JAI for a client team. The price is not set.", figure: SPECIFICITY_FIGURE },
  { title: "Voice add-on", body: "AIS2L voice follow-up, sold beside the ads.", figure: SPECIFICITY_FIGURE },
  { title: "Be Found services", body: "Adjacent discovery services. Counts are not stated here.", figure: SPECIFICITY_FIGURE },
  {
    title: "Proprietary data that compounds",
    body: "Each campaign adds checked outcomes by segment, vendor, and channel. That history informs the next list. It is a mechanism, not a valued asset.",
    figure: SPECIFICITY_FIGURE,
  },
] as const;

export const WHY_NOW = [
  "Bots were a majority of observed web traffic in 2025 (Thales, April 29, 2026).",
  "Unprotected programmatic buying is where invalid traffic concentrates (Pixalate Q2 2026, ANA Q2 2026, DoubleVerify 2026).",
  "Identity stays split across walled gardens. A device-level audience can be sourced fresh for each campaign and prepared for each platform.",
  "Automated buying is spreading. JAI's rule is structural: a bot may recommend a change and cannot send it.",
] as const;

export const INVESTOR_DISCLAIMER =
  "Forward-looking statements. This demo may contain forward-looking statements about Specificity Inc. (OTC: SPTY), including its plans, products, and markets. They involve risks and uncertainties, and actual results may differ materially. Specificity undertakes no obligation to update them. Nothing here is an offer to sell securities or a solicitation to buy securities. This material is subject to review by securities counsel before it is used with investors. It does not promise any return.";

export const CLIENT_SETUP = [
  "Tell us the campaign and who you sell to.",
  "JAI sources a fresh data-market list for that campaign. Every row keeps the vendor, the list id, and the time it was sourced.",
  "The same list is prepared for Meta, Google, TikTok, and StackAdapt. Pixels can retarget people who engage. A live upload stays off until a person turns it on.",
  "You see checked conversions, segment tests, and a weekly note in plain English.",
  "A bot may recommend a change. A person on your team approves it or declines it.",
] as const;

export const CLIENT_WEEKLY = [
  "What changed, in plain English, with a Based on line that names the row.",
  "Platform-reported conversions beside the ones JAI counted.",
  "Segments marked scale, test, or cut. A person still decides.",
  "A vendor list flagged when it matches known fake IDs.",
  "The decision waiting for you. The client view leaves cost off the page.",
] as const;

export const CLIENT_PRICING = [
  { title: "Platform subscription", figure: SPECIFICITY_FIGURE },
  { title: "Managed media", figure: SPECIFICITY_FIGURE },
  { title: "Voice add-on", figure: SPECIFICITY_FIGURE },
] as const;

export function formatDemoStamp(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export const STALE_LIST = DEMO_STALE_LIST;
export const FRESH_LIST = DEMO_LIST;

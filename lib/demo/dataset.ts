import { DEMO_WORKSPACE_ID } from "./isolation";

/** Shared demo counts. Tour copy may cite these. They are seed facts, not industry claims. */
export const DEMO_FACTS = {
  fakeMaids: 80,
  matchedMaids: 48,
} as const;

export type DemoPlatform = "meta" | "google_ads" | "tiktok" | "stackadapt" | "ais2l";
export type FatigueState = "fresh" | "tiring" | "fatigued";

export type DemoClient = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type DemoCreative = {
  id: string;
  name: string;
  fatigue: FatigueState;
  headline: string;
};

export type DemoCampaign = {
  id: string;
  clientId: string;
  platform: DemoPlatform;
  name: string;
  illustrative: boolean;
  kind: "audience" | "platform_targeting" | "standard" | "voice";
  creatives: DemoCreative[];
};

export type DemoMetric = {
  campaignId: string;
  creativeId: string;
  date: string;
  impressions: number;
  clicks: number;
  leads: number;
  verifiedConversions: number;
  spendCents: number;
};

export type DemoLead = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone: string;
  secondsToLead: number;
  source: string;
};

export type DemoMaid = {
  id: string;
  clientId: string;
  maid: string;
  matched: boolean;
  lineage: string;
};

export type DemoSegment = {
  id: string;
  clientId: string;
  name: string;
  action: "scale" | "test" | "cut";
  verifiedConversions: number;
  note: string;
};

export type DemoDecision = {
  id: string;
  kind: "fatigue" | "segment_scale" | "segment_test" | "segment_cut";
  title: string;
  summary: string;
  basedOn: string;
};

export type DemoFeedItem = {
  id: string;
  title: string;
  body: string;
  basedOn: string;
};

export type DemoBotNote = {
  id: string;
  title: string;
  plain: string;
  basedOn: string;
};

export type DemoReportWeek = {
  label: string;
  leads: number;
  booked: number;
  spendCents: number;
  note: string;
};

export type DemoReport = {
  clientId: string;
  title: string;
  weeks: DemoReportWeek[];
};

export type DemoDataset = {
  workspaceId: typeof DEMO_WORKSPACE_ID;
  clients: DemoClient[];
  campaigns: DemoCampaign[];
  metrics: DemoMetric[];
  leads: DemoLead[];
  maids: DemoMaid[];
  segments: DemoSegment[];
  decisions: DemoDecision[];
  feed: DemoFeedItem[];
  bots: DemoBotNote[];
  reports: DemoReport[];
};

const CLIENTS: DemoClient[] = [
  { id: "demo_harbor", name: "Harbor Point Marine (Demo)", email: "harbor.demo@example.com", phone: "+15555550101" },
  { id: "demo_sunline", name: "Sunline Home Services (Demo)", email: "sunline.demo@example.com", phone: "+15555550102" },
  { id: "demo_dental", name: "Gulf Coast Dental (Demo)", email: "dental.demo@example.com", phone: "+15555550103" },
  { id: "demo_northwind", name: "Northwind Outfitters (Demo)", email: "northwind.demo@example.com", phone: "+15555550104" },
];

const CAMPAIGNS: DemoCampaign[] = [
  {
    id: "demo_harbor_audience",
    clientId: "demo_harbor",
    platform: "meta",
    name: "Verified humans — boat service",
    illustrative: false,
    kind: "audience",
    creatives: [
      { id: "demo_harbor_fresh", name: "Dockside morning", fatigue: "fresh", headline: "Book a spring haul-out" },
      { id: "demo_harbor_tiring", name: "Weekend slip", fatigue: "tiring", headline: "Reserve a slip this weekend" },
      { id: "demo_harbor_fatigued", name: "Same hull photo", fatigue: "fatigued", headline: "Same hull, third week" },
    ],
  },
  {
    id: "demo_harbor_platform",
    clientId: "demo_harbor",
    platform: "meta",
    name: "Platform targeting (illustrative)",
    illustrative: true,
    kind: "platform_targeting",
    creatives: [{ id: "demo_harbor_platform_ad", name: "Broad interest boats", fatigue: "fresh", headline: "People who like boats" }],
  },
  {
    id: "demo_harbor_google",
    clientId: "demo_harbor",
    platform: "google_ads",
    name: "Harbor search",
    illustrative: false,
    kind: "standard",
    creatives: [{ id: "demo_harbor_search", name: "Marina service query", fatigue: "fresh", headline: "Marina service near the harbor" }],
  },
  {
    id: "demo_sunline_tiktok",
    clientId: "demo_sunline",
    platform: "tiktok",
    name: "Sunline short video",
    illustrative: false,
    kind: "standard",
    creatives: [{ id: "demo_sunline_tiktok_ad", name: "AC checkup", fatigue: "fresh", headline: "A 20-second AC checkup" }],
  },
  {
    id: "demo_sunline_stackadapt",
    clientId: "demo_sunline",
    platform: "stackadapt",
    name: "Sunline verified humans",
    illustrative: false,
    kind: "audience",
    creatives: [{ id: "demo_sunline_stack_ad", name: "Neighborhood HVAC", fatigue: "tiring", headline: "HVAC help on your street" }],
  },
  {
    id: "demo_dental_meta",
    clientId: "demo_dental",
    platform: "meta",
    name: "Dental new patients",
    illustrative: false,
    kind: "audience",
    creatives: [{ id: "demo_dental_meta_ad", name: "New patient visit", fatigue: "fresh", headline: "A first visit, clearly priced" }],
  },
  {
    id: "demo_dental_voice",
    clientId: "demo_dental",
    platform: "ais2l",
    name: "AIS2L voice follow-up",
    illustrative: false,
    kind: "voice",
    creatives: [{ id: "demo_dental_voice_ad", name: "Missed-call return", fatigue: "fresh", headline: "We called back about the visit" }],
  },
  {
    id: "demo_northwind_google",
    clientId: "demo_northwind",
    platform: "google_ads",
    name: "Northwind search",
    illustrative: false,
    kind: "standard",
    creatives: [{ id: "demo_northwind_search", name: "Trail boots query", fatigue: "fresh", headline: "Trail boots, sized in store" }],
  },
  {
    id: "demo_northwind_stack",
    clientId: "demo_northwind",
    platform: "stackadapt",
    name: "Northwind display",
    illustrative: false,
    kind: "audience",
    creatives: [{ id: "demo_northwind_stack_ad", name: "Weekend hikers", fatigue: "fatigued", headline: "The same ridge photo" }],
  },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDays(end: Date, count: number) {
  const days: string[] = [];
  const utc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let i = count - 1; i >= 0; i -= 1) days.push(new Date(utc - i * 86400000).toISOString().slice(0, 10));
  return days;
}

function series(input: {
  rng: () => number;
  dates: string[];
  campaignId: string;
  creativeId: string;
  baseImpressions: number;
  ctr: number;
  leadRate: number;
  verifiedRate: number;
  spendPerClickCents: number;
  fatigue: FatigueState;
}) {
  return input.dates.map((date, index) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.7 : 1;
    const drift = input.fatigue === "fatigued" ? 1 - (index / input.dates.length) * 0.55 : input.fatigue === "tiring" ? 1 - (index / input.dates.length) * 0.22 : 1;
    const noise = 0.86 + input.rng() * 0.28;
    const impressions = Math.max(40, Math.round(input.baseImpressions * weekend * noise));
    const clicks = Math.max(1, Math.round(impressions * input.ctr * drift * (0.92 + input.rng() * 0.16)));
    const leads = Math.max(0, Math.round(clicks * input.leadRate));
    const verifiedConversions = Math.max(0, Math.round(leads * input.verifiedRate));
    const spendCents = clicks * input.spendPerClickCents;
    return {
      campaignId: input.campaignId,
      creativeId: input.creativeId,
      date,
      impressions,
      clicks,
      leads,
      verifiedConversions,
      spendCents,
    };
  });
}

function profile(campaign: DemoCampaign) {
  if (campaign.kind === "platform_targeting") {
    return { baseImpressions: 1400, ctr: 0.012, leadRate: 0.08, verifiedRate: 0.22, spendPerClickCents: 310 };
  }
  if (campaign.kind === "voice") {
    return { baseImpressions: 80, ctr: 0.4, leadRate: 0.5, verifiedRate: 0.7, spendPerClickCents: 40 };
  }
  if (campaign.kind === "audience") {
    return { baseImpressions: 900, ctr: 0.018, leadRate: 0.14, verifiedRate: 0.62, spendPerClickCents: 140 };
  }
  return { baseImpressions: 700, ctr: 0.02, leadRate: 0.11, verifiedRate: 0.48, spendPerClickCents: 180 };
}

export function buildDemoDataset(now = new Date("2026-10-30T15:00:00Z")): DemoDataset {
  const dates = isoDays(now, 90);
  const rng = mulberry32(0xd3e0);
  const metrics: DemoMetric[] = [];
  for (const campaign of CAMPAIGNS) {
    for (const creative of campaign.creatives) {
      const rates = profile(campaign);
      metrics.push(...series({ rng, dates, campaignId: campaign.id, creativeId: creative.id, fatigue: creative.fatigue, ...rates }));
    }
  }
  const maids: DemoMaid[] = Array.from({ length: DEMO_FACTS.fakeMaids }, (_, index) => {
    const n = String(index + 1).padStart(4, "0");
    return {
      id: `demo_maid_${n}`,
      clientId: "demo_harbor",
      maid: `demo-maid-harbor-${n}`,
      matched: index < DEMO_FACTS.matchedMaids,
      lineage: "Demo upload Harbor Point Marine (Demo), file demo-upload-001",
    };
  });
  return {
    workspaceId: DEMO_WORKSPACE_ID,
    clients: CLIENTS,
    campaigns: CAMPAIGNS,
    metrics,
    leads: [
      { id: "demo_lead_1", clientId: "demo_harbor", name: "Casey Demo", email: "casey.demo@example.com", phone: "+15555550111", secondsToLead: 22, source: "Meta form" },
      { id: "demo_lead_2", clientId: "demo_harbor", name: "Riley Demo", email: "riley.demo@example.com", phone: "+15555550112", secondsToLead: 48, source: "Google form" },
      { id: "demo_lead_3", clientId: "demo_sunline", name: "Avery Demo", email: "avery.demo@example.com", phone: "+15555550113", secondsToLead: 95, source: "TikTok form" },
      { id: "demo_lead_4", clientId: "demo_dental", name: "Quinn Demo", email: "quinn.demo@example.com", phone: "+15555550114", secondsToLead: 240, source: "Meta form" },
      { id: "demo_lead_5", clientId: "demo_dental", name: "Parker Demo", email: "parker.demo@example.com", phone: "+15555550115", secondsToLead: 18, source: "AIS2L voice" },
      { id: "demo_lead_6", clientId: "demo_northwind", name: "Rowan Demo", email: "rowan.demo@example.com", phone: "+15555550116", secondsToLead: 640, source: "StackAdapt form" },
    ],
    maids,
    segments: [
      { id: "demo_seg_scale", clientId: "demo_harbor", name: "Marina owners, weekday", action: "scale", verifiedConversions: 36, note: "This demo segment kept converting after the other slices flattened." },
      { id: "demo_seg_test", clientId: "demo_sunline", name: "Renters, AC over 12 years", action: "test", verifiedConversions: 11, note: "Still a small demo slice. Hold it as a test." },
      { id: "demo_seg_cut", clientId: "demo_northwind", name: "Broad outdoor interest", action: "cut", verifiedConversions: 2, note: "This demo slice matched platform interest and did not convert." },
    ],
    decisions: [
      { id: "demo_dec_fatigue", kind: "fatigue", title: "Retire the repeated hull photo", summary: "The demo creative 'Same hull photo' lost clicks across the seeded window.", basedOn: "Harbor Point Marine (Demo), creative Same hull photo, seeded 90-day window" },
      { id: "demo_dec_scale", kind: "segment_scale", title: "Scale marina owners", summary: "The weekday marina-owner slice is the converting demo segment.", basedOn: "Harbor Point Marine (Demo), segment Marina owners, weekday" },
      { id: "demo_dec_test", kind: "segment_test", title: "Keep the AC renter test", summary: "Leave the renter slice in test. The demo sample is still small.", basedOn: "Sunline Home Services (Demo), segment Renters, AC over 12 years" },
      { id: "demo_dec_cut", kind: "segment_cut", title: "Cut broad outdoor interest", summary: "The broad interest slice in this demo did not convert.", basedOn: "Northwind Outfitters (Demo), segment Broad outdoor interest" },
    ],
    feed: [
      { id: "demo_feed_1", title: "Fatigue showed up on a demo creative", body: "Same hull photo is marked fatigued in the Harbor Point Marine demo.", basedOn: "Seeded fatigue state on demo_harbor_fatigued" },
      { id: "demo_feed_2", title: "A demo lead was touched in 22 seconds", body: "Casey Demo at Harbor Point Marine has a 22 second speed-to-lead in the seed.", basedOn: "Demo lead demo_lead_1" },
      { id: "demo_feed_3", title: "Voice follow-up is in the demo", body: "Gulf Coast Dental has an AIS2L voice campaign in the seed. No live call is placed.", basedOn: "Campaign demo_dental_voice" },
      { id: "demo_feed_4", title: "One demo segment is ready to scale", body: "Marina owners, weekday is marked scale. A person still has to accept it.", basedOn: "Decision demo_dec_scale" },
    ],
    bots: [
      { id: "demo_bot_1", title: "Why this creative is tired", plain: "The same hull photo kept running in the demo, and clicks fell across the seeded days. Retiring it is a suggestion.", basedOn: "Harbor Point Marine (Demo), creative Same hull photo" },
      { id: "demo_bot_2", title: "Why this segment is a test", plain: "The renter slice has a few demo conversions and not enough days to call it a winner.", basedOn: "Sunline Home Services (Demo), segment Renters, AC over 12 years" },
      { id: "demo_bot_3", title: "Why the voice row is here", plain: "The dental demo includes an AIS2L follow-up so the screen can show voice next to ads. It does not dial.", basedOn: "Gulf Coast Dental (Demo), campaign AIS2L voice follow-up" },
    ],
    reports: [
      {
        clientId: "demo_dental",
        title: "Gulf Coast Dental (Demo) weekly report",
        weeks: [
          { label: "Week 1", leads: 14, booked: 6, spendCents: 42000, note: "New-patient visits from the demo audience." },
          { label: "Week 2", leads: 18, booked: 9, spendCents: 45500, note: "Voice follow-up added two booked visits in the seed." },
          { label: "Week 3", leads: 16, booked: 7, spendCents: 43800, note: "The demo week stayed in the same range." },
          { label: "Week 4", leads: 21, booked: 11, spendCents: 47200, note: "Booked visits are the number this demo report leads with." },
        ],
      },
    ],
  };
}

export function campaignTotals(dataset: DemoDataset, campaignId: string) {
  return dataset.metrics.filter((row) => row.campaignId === campaignId).reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      clicks: sum.clicks + row.clicks,
      leads: sum.leads + row.leads,
      verifiedConversions: sum.verifiedConversions + row.verifiedConversions,
      spendCents: sum.spendCents + row.spendCents,
    }),
    { impressions: 0, clicks: 0, leads: 0, verifiedConversions: 0, spendCents: 0 },
  );
}

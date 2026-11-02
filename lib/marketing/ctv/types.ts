export type CtvPlatformId = "stackadapt";

export type CtvMatchMethod = "deterministic_maid" | "ip_device_graph" | "probabilistic";

export type CtvLinkType = "click" | "view";

export type CtvVerification = "verified_human" | "excluded" | "unflagged";

export type CtvRecommendation = "scale" | "test" | "cut";

export type CtvExposure = {
  eventId: string;
  ts: string;
  campaignId: string;
  campaignName: string;
  lineItemId: string;
  lineItemName: string;
  creativeId: string;
  creativeName: string;
  audienceId: string;
  maidListId: string;
  vendorId: string;
  subSegmentKey: string;
  householdId: string;
  ipHash: string;
  deviceType: string;
  publisher: string;
  appBundle: string;
  completionPct: number;
  interaction: CtvLinkType;
  maid: string;
};

export type CtvHousehold = {
  householdId: string;
  ipHash: string;
  linkedMaids: string[];
  linkedCookies: string[];
  matchMethod: CtvMatchMethod;
  matchConfidence: number;
};

export type CtvConversion = {
  conversionId: string;
  pixelEvent: string;
  ts: string;
  value: number;
  crmOutcome: string;
  maidListId: string;
  vendorId: string;
  subSegmentKey: string;
  audienceId: string;
  householdId: string;
  ipHash: string;
  deviceType: string;
  maid: string;
  cookie: string;
  passesDedupe: boolean;
  leadInvolved: boolean;
  contactValid: boolean | null;
  crmOrPixelEngaged: boolean;
  siteVisit: boolean;
  creditedChannel: string;
};

export type CtvDelivery = {
  date: string;
  campaignId: string;
  campaignName: string;
  lineItemId: string;
  lineItemName: string;
  creativeId: string;
  creativeName: string;
  audienceId: string;
  audienceName: string;
  maidListId: string;
  vendorId: string;
  subSegmentKey: string;
  deviceType: string;
  publisher: string;
  impressions: number;
  uniqueImpressions: number;
  frequency: number;
  completion25: number;
  completion50: number;
  completion75: number;
  completion100: number;
  completionRate: number | null;
  spend: number;
  clickConversions: number;
  viewConversions: number;
  conversionValue: number;
  ipConversions: number;
  cookieConversions: number;
  siteVisits: number;
  currency: string;
};

export type CtvNativeWindow = {
  clickDays: number | null;
  viewDays: number | null;
  label: string;
  source: string;
};

export type CtvPlatformLift = {
  kind: "brand_lift" | "ghost_bid" | "psa";
  name: string;
  maidListId: string;
  vendorId: string;
  subSegmentKey: string;
  exposedCvr: number;
  controlCvr: number;
  exposedTrials: number;
  controlTrials: number;
};

export type CtvPull = {
  platform: CtvPlatformId;
  exampleData: boolean;
  warnings: string[];
  delivery: CtvDelivery[];
  exposures: CtvExposure[];
  households: CtvHousehold[];
  conversions: CtvConversion[];
  nativeWindow: CtvNativeWindow;
  platformLifts: CtvPlatformLift[];
};

export type CtvLink = {
  exposureEventId: string;
  conversionId: string;
  linkType: CtvLinkType;
  matchMethod: CtvMatchMethod;
  matchConfidence: number;
  lagHours: number;
  counted: boolean;
};

export type CtvAudience = "staff" | "staff_nocost" | "client" | "share";

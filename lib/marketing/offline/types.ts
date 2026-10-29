export const STAGE_KINDS = ["qualified", "booked", "sold"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const CONVERSION_PLATFORMS = ["meta", "google_ads"] as const;
export type ConversionPlatformName = (typeof CONVERSION_PLATFORMS)[number];

export const META_EVENT_NAMES = ["Lead", "Schedule", "Purchase", "CompleteRegistration", "Subscribe"] as const;
export type MetaEventName = (typeof META_EVENT_NAMES)[number];

export const ATTRIBUTION_KEYS = [
  "fbclid",
  "fbc",
  "fbp",
  "gclid",
  "gbraid",
  "wbraid",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type Attribution = Record<AttributionKey, string>;

export type StageMap = {
  id: string;
  ghlStageId: string;
  ghlStageName: string;
  kind: StageKind;
  valueCents: number | null;
  currency: string;
  metaEventName: string;
  googleAction: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  ghlLocationId: string;
  enabledAt: string | null;
  stages: StageMap[];
};

export type DecisionStatus = "pending" | "accepted" | "declined" | "later";

export type DecisionRecord = {
  id: string;
  clientId: string;
  status: DecisionStatus;
  expiresAt: string;
  decidedById: string | null;
  decidedAt: string | null;
  undoUntil: string | null;
  createdAt: string;
};

export type EventRecord = Attribution & {
  id: string;
  clientId: string;
  contactId: string | null;
  source: string;
  externalId: string;
  kind: StageKind;
  stageName: string;
  valueCents: number | null;
  currency: string;
  emailHashMeta: string;
  emailHashGoogle: string;
  phoneHashMeta: string;
  phoneHashGoogle: string;
  occurredAt: string;
};

export type UploadStatus = "dry_run" | "sent" | "failed" | "skipped";

export type UploadRecord = {
  id: string;
  eventId: string;
  platform: ConversionPlatformName;
  status: UploadStatus;
  payload: unknown;
  attempts: number;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
  sentAt: string | null;
};

export type IssueRecord = {
  id: string;
  clientId: string;
  code: string;
  platform: string;
  occurredAt: string;
};

export type AlertSeverityName = "info" | "warning" | "critical";

export type AlertRecord = {
  id: string;
  clientId: string;
  platform: ConversionPlatformName;
  severity: AlertSeverityName;
  code: string;
  dedupeKey: string;
  title: string;
  summary: string;
  firedAt: string;
  resolvedAt: string | null;
  mutedUntil: string | null;
};

export type CycleState = {
  clients: ClientRecord[];
  decisions: DecisionRecord[];
  events: EventRecord[];
  uploads: UploadRecord[];
  issues: IssueRecord[];
  alerts: AlertRecord[];
};

export const DEFAULT_STAGES: Omit<StageMap, "id">[] = [
  {
    ghlStageId: "",
    ghlStageName: "Qualified",
    kind: "qualified",
    valueCents: null,
    currency: "USD",
    metaEventName: "Lead",
    googleAction: "Qualified lead",
  },
  {
    ghlStageId: "",
    ghlStageName: "Booked",
    kind: "booked",
    valueCents: null,
    currency: "USD",
    metaEventName: "Schedule",
    googleAction: "Booked call",
  },
  {
    ghlStageId: "",
    ghlStageName: "Sold",
    kind: "sold",
    valueCents: null,
    currency: "USD",
    metaEventName: "Purchase",
    googleAction: "Sold",
  },
];

export function emptyAttribution(): Attribution {
  return {
    fbclid: "",
    fbc: "",
    fbp: "",
    gclid: "",
    gbraid: "",
    wbraid: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmTerm: "",
    utmContent: "",
  };
}

export function isMetaEventName(value: string): value is MetaEventName {
  return (META_EVENT_NAMES as readonly string[]).includes(value);
}

export function isStageKind(value: string): value is StageKind {
  return (STAGE_KINDS as readonly string[]).includes(value);
}

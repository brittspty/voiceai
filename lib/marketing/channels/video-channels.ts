import { jarvisUiV2Enabled, type Env } from "../config";
import { stripForAudience } from "./cost-strip";

/**
 * Example YouTube and CTV channels. YouTube is bought through Google Ads.
 * CTV is a placeholder until a platform is chosen. Nothing here calls the network.
 */
export type VideoChannelId = "youtube" | "ctv";

export type VideoMetric = { id: string; label: string; value: string };

export type VideoChannelView = {
  id: VideoChannelId;
  label: string;
  href: string;
  status: string;
  connection: string;
  matchLabel: string;
  metrics: VideoMetric[];
  leads: number;
  qualified: number;
  booked: number;
  hierarchy: string;
  placeholder: boolean;
  example: true;
  spend?: number;
  cpl?: number;
  roas?: number;
  cpa?: number;
};

export type DensePlacement<T> = {
  columns: T[];
  more: T[];
  moreLabel: "More channels";
  moreLink: string;
};

const YOUTUBE_METRICS: VideoMetric[] = [
  { id: "views", label: "Views", value: "184K" },
  { id: "view_through_rate", label: "View-through rate", value: "31%" },
  { id: "completed_views", label: "Completed views", value: "46.2K" },
];

const CTV_METRICS: VideoMetric[] = [
  { id: "completion_rate", label: "Completion rate", value: "72%" },
  { id: "households_reached", label: "Households reached", value: "41K" },
  { id: "frequency", label: "Frequency", value: "2.4" },
];

type VideoChannel = VideoChannelView & { connected: boolean; clientLabel: string; clientHref: string };

const VIDEO_CHANNELS: VideoChannel[] = [
  {
    id: "youtube",
    label: "YouTube",
    clientLabel: "YouTube video ads",
    href: "/c/all/youtube",
    clientHref: "/c/harbor/youtube",
    status: "Through the Google Ads account",
    connection: "Through the Google Ads account",
    matchLabel: "YouTube (via Google)",
    metrics: YOUTUBE_METRICS,
    leads: 18,
    qualified: 7,
    booked: 3,
    hierarchy: "Campaign › Ad group › Video ad",
    placeholder: false,
    example: true,
    connected: true,
    spend: 760,
    cpl: 42,
    roas: 2.1,
    cpa: 109,
  },
  {
    id: "ctv",
    label: "Other CTV",
    clientLabel: "Connected TV ads",
    href: "/c/all/ctv",
    clientHref: "/c/harbor/ctv",
    status: "Needs setup",
    connection: "Other CTV placeholder",
    matchLabel: "Other CTV",
    metrics: CTV_METRICS,
    leads: 0,
    qualified: 0,
    booked: 0,
    hierarchy: "Campaign › Line item › Ad",
    placeholder: true,
    example: true,
    connected: false,
  },
];

/** A full row keeps YouTube and CTV on a More channels line instead of new columns. */
export function placeInDenseRow<T>(primary: T[], extras: T[], fullAt = 4): DensePlacement<T> {
  const full = primary.length >= fullAt;
  const room = full ? 0 : Math.max(0, fullAt - primary.length);
  const more = full ? extras : extras.slice(room);
  return {
    columns: full ? primary : [...primary, ...extras.slice(0, room)],
    more,
    moreLabel: "More channels",
    moreLink: more.length ? `+${more.length} more` : "",
  };
}

export function videoChannelsEnabled(env?: Env) {
  return jarvisUiV2Enabled(env);
}

/** Staff see both. Clients see connected channels only, and never cost fields. */
export function presentedVideoChannels(audience: "staff" | "client", env?: Env): VideoChannelView[] {
  if (!videoChannelsEnabled(env)) return [];
  const rows = audience === "client" ? VIDEO_CHANNELS.filter((row) => row.connected) : VIDEO_CHANNELS;
  return rows.map((row) => {
    const view: VideoChannelView = {
      id: row.id,
      label: audience === "client" ? row.clientLabel : row.label,
      href: audience === "client" ? row.clientHref : row.href,
      status: row.status,
      connection: row.connection,
      matchLabel: row.matchLabel,
      metrics: row.metrics,
      leads: row.leads,
      qualified: row.qualified,
      booked: row.booked,
      hierarchy: row.hierarchy,
      placeholder: row.placeholder,
      example: true,
    };
    if (audience === "staff" && row.id === "youtube") {
      view.spend = row.spend;
      view.cpl = row.cpl;
      view.roas = row.roas;
      view.cpa = row.cpa;
    }
    return audience === "staff" ? view : stripForAudience(view, "client");
  });
}

export type MoreMatch = {
  id: VideoChannelId;
  label: string;
  percent: number | null;
  hold: boolean;
  status: string;
};

/** YouTube copies the Google Customer Match rate. CTV stays a placeholder. */
export function audienceMoreChannels(googleRate: number | undefined, enabled: boolean): MoreMatch[] | undefined {
  if (!enabled) return undefined;
  const percent = googleRate == null || Number.isNaN(googleRate) ? null : Math.round(googleRate * 100);
  return [
    { id: "youtube", label: "YouTube (via Google)", percent, hold: percent != null && percent < 30, status: "Through the Google Ads account" },
    { id: "ctv", label: "Other CTV", percent: null, hold: false, status: "Needs setup" },
  ];
}

export type MoreResolution = {
  id: VideoChannelId;
  label: string;
  percent: number | null;
  status: string;
  placeholder: boolean;
};

export function resolutionMoreChannels(googlePercent: number | null, enabled: boolean): MoreResolution[] | undefined {
  if (!enabled) return undefined;
  return [
    { id: "youtube", label: "YouTube (via Google)", percent: googlePercent, status: "Through the Google Ads account", placeholder: false },
    { id: "ctv", label: "Other CTV", percent: null, status: "Needs setup", placeholder: true },
  ];
}

export function portfolioMoreChannels(enabled: boolean) {
  if (!enabled) return undefined;
  return [
    { label: "YouTube", status: "Through the Google Ads account" },
    { label: "Other CTV", status: "Needs setup" },
  ];
}

import { formatCount, formatMoney } from "./dashboard-model";
import type { HomeScope } from "./isolation";
import { scopeWorkspaceIds } from "./isolation";

export type HomeMetric = {
  workspaceId: string;
  platform: "meta" | "google_ads";
  impressions: number;
  clicks: number;
  leads: number;
  calls: number;
  spend?: number;
};

export type HomeWorkspace = {
  id: string;
  name: string;
  voiceEnabled: boolean;
};

export type HomeClientRow = {
  id: string;
  name: string;
  voiceEnabled: boolean;
  views: number;
  clicks: number;
  leads: number;
  calls: number;
  platforms: string[];
  spend?: number;
  overPace?: number;
};

export type HomeFeature = {
  id: "platforms" | "speed" | "quality" | "landing" | "fatigue" | "pacing" | "search" | "competitors" | "holdouts";
  title: string;
  detail: string;
};

export type HomeVoice = {
  clients: string[];
  dials: number;
  answered: number;
  meetings: number;
};

export type HomeModel = {
  aggregate: boolean;
  showMoney: boolean;
  canPickClient: boolean;
  title: string;
  subtitle: string;
  selectedId: string | null;
  clients: HomeClientRow[];
  features: HomeFeature[];
  voice: HomeVoice | null;
  denied: boolean;
};

const COST_KEY = /spend|budget|cpc|cpm|cpa|roas|cost|overpace|pace/i;

function onOrOff(on: boolean, off: string, detail: string | null, empty: string) {
  if (!on) return off;
  return detail || empty;
}

export function homeFeatures(input: {
  googleOn: boolean;
  hasGoogleRows: boolean;
  speedOn: boolean;
  speedDetail: string | null;
  qualityOn: boolean;
  qualityDetail: string | null;
  landingOn: boolean;
  landingDetail: string | null;
  fatigueOn: boolean;
  fatigueDetail: string | null;
  showMoney: boolean;
  pacingOn: boolean;
  pacingDetail: string | null;
  searchOn: boolean;
  searchDetail: string | null;
  competitorsOn: boolean;
  competitorsDetail: string | null;
  holdoutsOn: boolean;
  holdoutsDetail: string | null;
}): HomeFeature[] {
  const features: HomeFeature[] = [
    {
      id: "platforms",
      title: "Ad platforms",
      detail: input.googleOn
        ? input.hasGoogleRows
          ? "Meta and Google are in this view."
          : "Meta is in this view. Google is on, with no rows yet."
        : "Meta is in this view. Google is off.",
    },
    {
      id: "speed",
      title: "Speed to lead",
      detail: onOrOff(input.speedOn, "Speed-to-lead is off.", input.speedDetail, "No responses recorded yet."),
    },
    {
      id: "quality",
      title: "Lead quality",
      detail: onOrOff(input.qualityOn, "Lead quality is off.", input.qualityDetail, "No scored leads yet."),
    },
    {
      id: "landing",
      title: "Landing pages",
      detail: onOrOff(input.landingOn, "Landing page checks are off.", input.landingDetail, "No pages are being checked yet."),
    },
    {
      id: "fatigue",
      title: "Creative fatigue",
      detail: onOrOff(input.fatigueOn, "Creative fatigue is off.", input.fatigueDetail, "No tired ads right now."),
    },
    {
      id: "search",
      title: "Search waste",
      detail: onOrOff(input.searchOn, "Search waste is off.", input.searchDetail, "No wasted terms right now."),
    },
    {
      id: "competitors",
      title: "Competitors",
      detail: onOrOff(input.competitorsOn, "Competitor watch is off.", input.competitorsDetail, "No competitors are being watched yet."),
    },
    {
      id: "holdouts",
      title: "Holdouts",
      detail: onOrOff(input.holdoutsOn, "Holdouts are off.", input.holdoutsDetail, "No holdout tests yet."),
    },
  ];
  if (input.showMoney) {
    features.splice(5, 0, {
      id: "pacing",
      title: "Pacing",
      detail: onOrOff(input.pacingOn, "Pacing is off.", input.pacingDetail, "No pacing snapshots yet."),
    });
  }
  return features;
}

export function assembleHome(input: {
  scope: HomeScope;
  showMoney: boolean;
  canPickClient: boolean;
  workspaces: HomeWorkspace[];
  metrics: HomeMetric[];
  overPaceByWorkspace?: { workspaceId: string; count: number }[];
  features: HomeFeature[];
  voice: { dials: number; answered: number; meetings: number } | null;
}): HomeModel {
  if (input.scope.kind === "none") {
    return {
      aggregate: false,
      showMoney: false,
      canPickClient: false,
      title: "Home",
      subtitle: "This client isn't available to you.",
      selectedId: null,
      clients: [],
      features: [],
      voice: null,
      denied: true,
    };
  }
  const allowed = new Set(scopeWorkspaceIds(input.scope));
  const workspaces = input.workspaces.filter((row) => allowed.has(row.id));
  const metrics = input.metrics.filter((row) => allowed.has(row.workspaceId));
  const pace = new Map((input.overPaceByWorkspace ?? []).filter((row) => allowed.has(row.workspaceId)).map((row) => [row.workspaceId, row.count]));
  const clients: HomeClientRow[] = workspaces
    .map((workspace) => {
      const rows = metrics.filter((row) => row.workspaceId === workspace.id);
      const platforms = [...new Set(rows.map((row) => (row.platform === "google_ads" ? "Google" : "Meta")))];
      const client: HomeClientRow = {
        id: workspace.id,
        name: workspace.name,
        voiceEnabled: workspace.voiceEnabled,
        views: rows.reduce((sum, row) => sum + row.impressions, 0),
        clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
        leads: rows.reduce((sum, row) => sum + row.leads, 0),
        calls: rows.reduce((sum, row) => sum + row.calls, 0),
        platforms,
      };
      if (input.showMoney) {
        client.spend = rows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
        client.overPace = pace.get(workspace.id) ?? 0;
      }
      return client;
    })
    .sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name));
  const voiceNames = clients.filter((client) => client.voiceEnabled).map((client) => client.name);
  const voice =
    voiceNames.length && input.voice
      ? { clients: voiceNames, dials: input.voice.dials, answered: input.voice.answered, meetings: input.voice.meetings }
      : null;
  const aggregate = input.scope.kind === "aggregate";
  const title = aggregate ? "All clients" : clients[0]?.name || "Home";
  return {
    aggregate,
    showMoney: input.showMoney,
    canPickClient: input.canPickClient,
    title,
    subtitle: aggregate
      ? "Ads, leads, and the rest of the marketing system. Voice is its own add-on."
      : "This client's ads and leads. Voice shows only when this client has it.",
    selectedId: input.scope.kind === "one" ? input.scope.workspaceId : null,
    clients,
    features: input.showMoney ? input.features : input.features.filter((feature) => feature.id !== "pacing"),
    voice,
    denied: false,
  };
}

export function homeHasForeignClient(model: HomeModel, ownWorkspaceId: string) {
  return model.aggregate || model.clients.some((client) => client.id !== ownWorkspaceId);
}

export function homeCostKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) homeCostKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (COST_KEY.test(key)) keys.push(key);
      homeCostKeys(child, keys);
    }
  }
  return keys;
}

export function homeKpiTotals(clients: HomeClientRow[]) {
  return {
    views: clients.reduce((sum, client) => sum + client.views, 0),
    leads: clients.reduce((sum, client) => sum + client.leads, 0),
    calls: clients.reduce((sum, client) => sum + client.calls, 0),
    spend: clients.reduce((sum, client) => sum + (client.spend ?? 0), 0),
  };
}

export { formatCount, formatMoney };

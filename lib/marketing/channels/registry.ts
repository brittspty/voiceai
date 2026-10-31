import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { omitForbiddenClientFields } from "../client-view";
import { stripForAudience } from "./cost-strip";
import { integrationsMode, type Env } from "../../env";
import { maidKeyBytes } from "../audiences/maid";

export const CHANNEL_TYPES = ["social", "search", "video", "ctv", "programmatic", "other"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type RegistryAuth = "oauth" | "api_key";
export type RegistryStatus = "available" | "beta" | "hidden";
export type ConnectionStateName = "needs_setup" | "connected" | "needs_reconnect" | "error" | "disconnected";
export type CapabilityWord = "supported" | "partial" | "not supported";
export type TestOutcome = "success" | "error" | "rate_limited" | "token_expired";

export type IdUpload = {
  maid: boolean;
  email: boolean;
  phone: boolean;
  ipv4: boolean;
  ipv6: boolean;
};

export type PlatformRegistryRow = {
  key: string;
  staffLabel: string;
  clientLabel: string;
  channelType: ChannelType;
  vendor: string;
  parentKey: string | null;
  auth: RegistryAuth;
  scopesRead: string[];
  writeCapable: boolean;
  writesEnabled: boolean;
  idUpload: IdUpload;
  matchRateSource: string | null;
  metrics: string[];
  hierarchy: string;
  colourToken: string;
  status: RegistryStatus;
  aliases: string[];
  /** False means no contract yet. The staff catalog still lists the platform. */
  contracted: boolean;
};

export type ClientConnectionRow = {
  clientId: string;
  platformKey: string;
  accountId: string;
  state: ConnectionStateName;
  lastTestAt: string | null;
  lastSyncAt: string | null;
  tokenRef: string | null;
  writesEnabled: boolean;
  disconnectedAt: string | null;
};

export type PlatformRequestRow = {
  id: string;
  name: string;
  category: ChannelType;
  docsLink: string;
  clientId: string;
  why: string;
  status: "queued" | "approved" | "declined";
  decidedBy: string;
  createdAt: string;
};

export type WriteApproval = {
  platformKey: string;
  approver: string;
  at: string;
};

export type RegistryState = {
  registry: PlatformRegistryRow[];
  connections: ClientConnectionRow[];
  requests: PlatformRequestRow[];
  approvals: WriteApproval[];
  matchRates: Record<string, number>;
};

export type RegistryActor = {
  kind: string;
  role: string;
  email: string;
  name: string;
  seesCost?: boolean;
};

const STAFF_KINDS = new Set(["super_admin", "account_manager", "staff"]);

export const CATALOG_CATEGORIES = ["All", "Social", "Search", "Video", "CTV", "Programmatic", "Other"] as const;

export const EXAMPLE_CLIENTS = [
  { id: "harbor", name: "Harbor Dental" },
  { id: "gulf", name: "Gulf Pest" },
] as const;

export const EXAMPLE_ACCOUNTS = [
  { clientId: "harbor", id: "act_harbor", name: "Harbor Dental — main" },
  { clientId: "gulf", id: "act_gulf", name: "Gulf Pest — main" },
] as const;

const NONE: IdUpload = { maid: false, email: false, phone: false, ipv4: false, ipv6: false };

function row(partial: PlatformRegistryRow): PlatformRegistryRow {
  return partial;
}

/** Seeded table rows. Hidden is only for internal or test rows. */
export const SEED_REGISTRY: PlatformRegistryRow[] = [
  row({
    key: "meta",
    staffLabel: "Meta",
    clientLabel: "Facebook & Instagram ads",
    channelType: "social",
    vendor: "Meta",
    parentKey: null,
    auth: "oauth",
    scopesRead: ["ads_read", "read_insights"],
    writeCapable: true,
    writesEnabled: false,
    idUpload: { maid: true, email: true, phone: true, ipv4: false, ipv6: false },
    matchRateSource: "meta_custom_audiences",
    metrics: ["leads", "ctr"],
    hierarchy: "Campaign > Ad set > Ad",
    colourToken: "#231F20",
    status: "available",
    aliases: ["facebook", "instagram", "fb"],
    contracted: true,
  }),
  row({
    key: "google_ads",
    staffLabel: "Google Ads",
    clientLabel: "Google search ads",
    channelType: "search",
    vendor: "Google",
    parentKey: null,
    auth: "oauth",
    scopesRead: ["adwords.readonly"],
    writeCapable: true,
    writesEnabled: false,
    idUpload: { maid: false, email: true, phone: true, ipv4: true, ipv6: true },
    matchRateSource: "google_customer_match",
    metrics: ["leads", "ctr"],
    hierarchy: "Campaign > Ad group > Ad",
    colourToken: "#FF5800",
    status: "available",
    aliases: ["google", "adwords", "search"],
    contracted: true,
  }),
  row({
    key: "youtube",
    staffLabel: "YouTube",
    clientLabel: "YouTube ads",
    channelType: "video",
    vendor: "Google",
    parentKey: "google_ads",
    auth: "oauth",
    scopesRead: ["youtube.readonly"],
    writeCapable: true,
    writesEnabled: false,
    idUpload: { maid: false, email: true, phone: true, ipv4: false, ipv6: false },
    matchRateSource: "google_customer_match",
    metrics: ["leads", "ctr"],
    hierarchy: "Campaign > Ad group > Ad",
    colourToken: "#B33E00",
    status: "available",
    aliases: ["yt", "video"],
    contracted: true,
  }),
  row({
    key: "stackadapt",
    staffLabel: "StackAdapt",
    clientLabel: "Display ads",
    channelType: "programmatic",
    vendor: "StackAdapt",
    parentKey: null,
    auth: "api_key",
    scopesRead: ["read"],
    writeCapable: false,
    writesEnabled: false,
    idUpload: { maid: true, email: true, phone: false, ipv4: true, ipv6: false },
    matchRateSource: "stackadapt_audiences",
    metrics: ["leads", "ctr"],
    hierarchy: "Campaign > Line item > Creative",
    colourToken: "#231F20",
    status: "available",
    aliases: ["programmatic", "display"],
    contracted: true,
  }),
  row({
    key: "ctv",
    staffLabel: "CTV",
    clientLabel: "Connected TV ads",
    channelType: "ctv",
    vendor: "stackadapt",
    parentKey: "stackadapt",
    auth: "api_key",
    scopesRead: ["read"],
    writeCapable: false,
    writesEnabled: false,
    idUpload: { maid: true, email: false, phone: false, ipv4: true, ipv6: true },
    matchRateSource: "stackadapt_audiences",
    metrics: ["leads", "ctr"],
    hierarchy: "Campaign > Line item > Creative",
    colourToken: "#FF5800",
    status: "available",
    aliases: ["connected tv", "television"],
    contracted: true,
  }),
  row({
    key: "google_business_profile",
    staffLabel: "Google Business Profile",
    clientLabel: "Google Maps listing",
    channelType: "other",
    vendor: "Google",
    parentKey: null,
    auth: "oauth",
    scopesRead: ["business.manage.readonly"],
    writeCapable: false,
    writesEnabled: false,
    idUpload: NONE,
    matchRateSource: null,
    metrics: ["calls", "profile_views"],
    hierarchy: "Location",
    colourToken: "#231F20",
    status: "available",
    aliases: ["gbp", "maps", "business profile"],
    contracted: true,
  }),
  row({
    key: "ais2l",
    staffLabel: "AIS2L / GoHighLevel",
    clientLabel: "Phone calls",
    channelType: "other",
    vendor: "GoHighLevel",
    parentKey: null,
    auth: "api_key",
    scopesRead: ["read"],
    writeCapable: false,
    writesEnabled: false,
    idUpload: NONE,
    matchRateSource: null,
    metrics: [],
    hierarchy: "Location",
    colourToken: "#231F20",
    status: "available",
    aliases: ["gohighlevel", "ghl", "voice"],
    contracted: true,
  }),
  row({
    key: "linkedin",
    staffLabel: "LinkedIn",
    clientLabel: "LinkedIn ads",
    channelType: "social",
    vendor: "LinkedIn",
    parentKey: null,
    auth: "oauth",
    scopesRead: ["r_ads_reporting", "r_marketing_leadgen_automation"],
    writeCapable: true,
    writesEnabled: false,
    idUpload: { maid: false, email: true, phone: true, ipv4: false, ipv6: false },
    matchRateSource: "linkedin_matched_audiences",
    metrics: ["leads", "lead_form_fills", "ctr"],
    hierarchy: "Campaign group > Campaign > Ad",
    colourToken: "#B33E00",
    status: "available",
    aliases: ["li", "linkedin ads"],
    contracted: false,
  }),
  row({
    key: "internal_probe",
    staffLabel: "Internal probe",
    clientLabel: "Internal probe",
    channelType: "other",
    vendor: "internal",
    parentKey: null,
    auth: "api_key",
    scopesRead: ["read"],
    writeCapable: false,
    writesEnabled: false,
    idUpload: NONE,
    matchRateSource: "internal_match",
    metrics: ["leads"],
    hierarchy: "",
    colourToken: "#231F20",
    status: "hidden",
    aliases: ["probe"],
    contracted: false,
  }),
];

function connection(partial: Pick<ClientConnectionRow, "clientId" | "platformKey" | "state"> & Partial<ClientConnectionRow>): ClientConnectionRow {
  return {
    accountId: partial.accountId ?? "",
    clientId: partial.clientId,
    platformKey: partial.platformKey,
    state: partial.state,
    lastTestAt: partial.lastTestAt ?? null,
    lastSyncAt: partial.lastSyncAt ?? null,
    tokenRef: partial.tokenRef ?? null,
    writesEnabled: false,
    disconnectedAt: partial.disconnectedAt ?? null,
  };
}

export const SEED_CONNECTIONS: ClientConnectionRow[] = [
  connection({ clientId: "harbor", platformKey: "meta", accountId: "act_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "google_ads", accountId: "act_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "youtube", accountId: "act_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "stackadapt", accountId: "act_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "ctv", accountId: "act_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "google_business_profile", accountId: "loc_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "ais2l", accountId: "ghl_harbor", state: "connected", lastSyncAt: "2026-10-30T21:12:00Z" }),
  connection({ clientId: "harbor", platformKey: "linkedin", accountId: "", state: "needs_setup" }),
];

export const SEED_MATCH_RATES: Record<string, number> = {
  meta: 0.62,
  google_ads: 0.48,
  youtube: 0.44,
  stackadapt: 0.22,
  ctv: 0.51,
};

const EXAMPLE_METRICS: Record<string, { spend: string; leads: string; cpl: string; qualified: string; status: string; tone: "ok" | "w" | "e" }> = {
  meta: { spend: "$3.9k", leads: "96", cpl: "$41", qualified: "31", status: "Anomaly", tone: "e" },
  google_ads: { spend: "$3.1k", leads: "74", cpl: "$42", qualified: "29", status: "Opportunity", tone: "ok" },
  stackadapt: { spend: "$1.3k", leads: "15", cpl: "$87", qualified: "4", status: "Opportunity", tone: "w" },
  google_business_profile: { spend: "n/a", leads: "22", cpl: "n/a", qualified: "7", status: "Normal", tone: "ok" },
  youtube: { spend: "$640", leads: "18", cpl: "$36", qualified: "6", status: "Connected", tone: "ok" },
  ctv: { spend: "$880", leads: "9", cpl: "$98", qualified: "2", status: "Connected", tone: "ok" },
};

export function exampleRegistryState(): RegistryState {
  return {
    registry: structuredClone(SEED_REGISTRY),
    connections: structuredClone(SEED_CONNECTIONS),
    requests: [],
    approvals: [],
    matchRates: { ...SEED_MATCH_RATES },
  };
}

export function canUseChannelRegistry(actor: { kind: string } | null | undefined) {
  return Boolean(actor && STAFF_KINDS.has(actor.kind));
}

/** Staff admins are super admins. Account managers and other staff cannot decide. */
export function canDecidePlatformRequest(actor: { kind: string; role: string } | null | undefined) {
  if (!actor) return false;
  return actor.kind === "super_admin" || actor.role === "super_admin";
}

export function isJasonApproval(actor: { name: string; email: string }) {
  const name = actor.name.trim().toLowerCase();
  const email = actor.email.trim().toLowerCase();
  return name === "jason" || email.startsWith("jason@");
}

export function clientChannelSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function categoryLabel(type: ChannelType) {
  if (type === "social") return "Social";
  if (type === "search") return "Search";
  if (type === "video") return "Video";
  if (type === "ctv") return "CTV";
  if (type === "programmatic") return "Programmatic";
  return "Other";
}

export function authLabel(auth: RegistryAuth) {
  return auth === "oauth" ? "OAuth" : "API key";
}

/** Channel nav and the command center. Hidden rows never appear. Conversion-only rows stay out of Channels. */
export function showsInChannelNav(row: PlatformRegistryRow) {
  if (row.status === "hidden") return false;
  if (row.channelType === "other" && row.metrics.length === 0 && !row.matchRateSource) return false;
  return true;
}

export function platformByKey(state: RegistryState, key: string) {
  return state.registry.find((item) => item.key === key) ?? null;
}

export function connectionFor(state: RegistryState, clientId: string, platformKey: string) {
  return state.connections.find((item) => item.clientId === clientId && item.platformKey === platformKey) ?? null;
}

function tokenKey(env: Env) {
  const configured = maidKeyBytes(env.CHANNEL_REGISTRY_TOKEN_KEY);
  if (configured) return configured;
  if (integrationsMode(env) !== "live") return createHash("sha256").update("channel-registry-mock-token-key").digest();
  throw new Error("CHANNEL_REGISTRY_TOKEN_KEY is required when integrations are live.");
}

/** Sealed token reference. The raw secret is not returned and is not stored. */
export function sealToken(secret: string, env: Env = process.env) {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error("API key or token is required.");
  const key = tokenKey(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const tokenRef = `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
  if (tokenRef.includes(trimmed)) throw new Error("Token reference leaked the secret.");
  return tokenRef;
}

export function idUploadLine(id: IdUpload) {
  const parts: string[] = [];
  if (id.maid) parts.push("MAID");
  if (id.email) parts.push("hashed email");
  if (id.phone) parts.push("hashed phone");
  if (id.ipv4) parts.push("IPv4");
  if (id.ipv6) parts.push("IPv6");
  if (!parts.length) return "No MAID or ID upload";
  return `ID upload: ${parts.join(", ")}`;
}

export function matchCapabilityLine(source: string | null) {
  return source ? "Match rate available" : "No match-rate row";
}

export function catalogStatus(connection: ClientConnectionRow | null) {
  if (!connection) return "Not connected";
  if (connection.state === "connected") return "Connected";
  if (connection.state === "needs_setup") return "Added needs setup";
  if (connection.state === "needs_reconnect") return "Needs reconnect";
  if (connection.state === "disconnected") return connection.disconnectedAt ? `disconnected ${connection.disconnectedAt}` : "disconnected";
  return "Not connected";
}

export type CatalogCard = {
  key: string;
  name: string;
  clientLabel: string;
  aliases: string[];
  category: ChannelType;
  categoryLabel: string;
  auth: "OAuth" | "API key";
  readOnly: "Read only by default";
  idUpload: string;
  matchRate: string;
  status: string;
  contracted: boolean;
  vendor: string;
  colourToken: string;
  hierarchy: string;
  scopesRead: string[];
};

/** Staff catalog. Hidden rows are internal or test only. Missing contracts stay listed. */
export function presentCatalog(state: RegistryState, clientId: string): CatalogCard[] {
  return state.registry
    .filter((item) => item.status !== "hidden")
    .map((item) => ({
      key: item.key,
      name: item.staffLabel,
      clientLabel: item.clientLabel,
      aliases: item.aliases,
      category: item.channelType,
      categoryLabel: categoryLabel(item.channelType),
      auth: authLabel(item.auth),
      readOnly: "Read only by default" as const,
      idUpload: idUploadLine(item.idUpload),
      matchRate: matchCapabilityLine(item.matchRateSource),
      status: catalogStatus(connectionFor(state, clientId, item.key)),
      contracted: item.contracted,
      vendor: item.vendor,
      colourToken: item.colourToken,
      hierarchy: item.hierarchy,
      scopesRead: item.scopesRead,
    }));
}

export function filterCatalog(cards: CatalogCard[], input: { query?: string; category?: string; showConnected?: boolean }) {
  const query = (input.query || "").trim().toLowerCase();
  const category = input.category || "All";
  return cards.filter((card) => {
    if (!input.showConnected && card.status === "Connected") return false;
    if (category !== "All" && card.categoryLabel !== category) return false;
    if (!query) return true;
    const hay = [card.name, card.clientLabel, card.key, card.vendor, ...card.aliases].join(" ").toLowerCase();
    return hay.includes(query);
  });
}

function joinAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function settingsStatus(connection: ClientConnectionRow) {
  if (connection.state === "connected") return "Connected";
  if (connection.state === "needs_setup") return "Needs setup";
  if (connection.state === "needs_reconnect") return "Needs reconnect";
  if (connection.state === "disconnected") return connection.disconnectedAt ? `disconnected ${connection.disconnectedAt}` : "disconnected";
  return "Not connected";
}

function accessWord(row: PlatformRegistryRow) {
  if (row.metrics.length === 0) return "Leads";
  if (row.channelType === "other" && row.metrics.includes("calls")) return "Read";
  return "Read only";
}

function writeWord(row: PlatformRegistryRow) {
  if (!row.writeCapable) return "Not needed";
  if (!row.writesEnabled) return "PENDING JASON APPROVAL";
  return "Approved by Jason";
}

export function settingsHeadline(rows: { label: string; healthy: boolean; needsSetup: boolean; setupName?: string }[]) {
  const healthy = rows.filter((item) => item.healthy).length;
  const setup = rows.filter((item) => item.needsSetup).map((item) => item.setupName || item.label);
  let sentence = `${healthy} of ${rows.length} connections are healthy.`;
  if (setup.length === 1) sentence += ` ${setup[0]} needs setup.`;
  else if (setup.length > 1) sentence += ` ${joinAnd(setup)} need setup.`;
  return sentence;
}

function dashes(status: string, tone: "ok" | "w" | "e") {
  return { spend: "—", leads: "—", cpl: "—", qualified: "—", status, tone };
}

function metricRow(row: PlatformRegistryRow, connection: ClientConnectionRow | null) {
  if (!connection || connection.state === "needs_setup") return dashes("Needs setup", "w");
  if (connection.state === "needs_reconnect") return dashes("Needs reconnect", "w");
  if (connection.state === "disconnected") return dashes(connection.disconnectedAt ? `disconnected ${connection.disconnectedAt}` : "disconnected", "w");
  if (connection.state !== "connected") return dashes("Not connected", "w");
  return EXAMPLE_METRICS[row.key] ?? dashes("Connected", "ok");
}

export type SurfaceRow = {
  key: string;
  href: string;
  name: string;
  spend: string;
  leads: string;
  cpl: string;
  qualified: string;
  status: string;
  tone: "ok" | "w" | "e";
  colourToken: string;
};

export type MatchLine = {
  key: string;
  label: string;
  text: string;
  connected: boolean;
  onHold: boolean;
  counted: boolean;
};

export type StaffSurfaces = {
  nav: { href: string; label: string; group: "Channels" }[];
  clientNav: { href: string; label: string; group: "Channels" }[];
  settings: {
    headline: string;
    rows: {
      key: string;
      label: string;
      status: string;
      access: string;
      writeLabel: string;
      healthy: boolean;
      needsSetup: boolean;
      canDisconnect: boolean;
      setupName: string;
    }[];
  };
  commandCenter: { main: SurfaceRow[]; more: SurfaceRow[]; moreLabel: string };
  audience: { lines: MatchLine[]; onHoldLabel: string; held: number; total: number };
  resolution: { rows: MatchLine[] };
  report: {
    blended: string;
    note: string | null;
    channels: { id: string; staffName: string; clientName: string; color: string }[];
  };
  clientChannels: { label: string; leads: string; qualified: string; booked: string }[];
};

function matchLines(state: RegistryState, clientId: string, labelFor: (row: PlatformRegistryRow) => string): MatchLine[] {
  const lines: MatchLine[] = [];
  for (const item of state.registry) {
    if (item.status === "hidden" || !item.matchRateSource) continue;
    const connection = connectionFor(state, clientId, item.key);
    const connected = connection?.state === "connected";
    if (connection?.state === "disconnected") continue;
    if (!connected) {
      lines.push({ key: item.key, label: labelFor(item), text: "Not connected yet", connected: false, onHold: false, counted: false });
      continue;
    }
    const rate = state.matchRates[item.key];
    const onHold = rate == null || rate < 0.3;
    const text = rate == null ? "Match rate not in yet" : onHold ? `${Math.round(rate * 100)}% · On hold` : `${Math.round(rate * 100)}%`;
    lines.push({ key: item.key, label: labelFor(item), text, connected: true, onHold, counted: true });
  }
  return lines;
}

function onHoldSummary(lines: MatchLine[]) {
  const counted = lines.filter((line) => line.counted);
  const held = counted.filter((line) => line.onHold).length;
  return { held, total: counted.length, onHoldLabel: `${held} of ${counted.length}` };
}

/** Clients only receive a channel that is connected for that client. */
export function presentClientChannels(state: RegistryState, clientId: string) {
    const channels = state.registry.flatMap((item) => {
    if (item.status === "hidden") return [];
    const connection = connectionFor(state, clientId, item.key);
    if (connection?.state !== "connected") return [];
    const metrics = metricRow(item, connection);
    return [{ label: item.clientLabel, leads: metrics.leads, qualified: metrics.qualified, booked: "—" }];
  });
  const payload = { channels };
  return omitForbiddenClientFields(stripForAudience(stripVendor(payload), "client"));
}

function stripVendor<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripVendor(item)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === "vendor") continue;
    out[key] = stripVendor(child);
  }
  return out as T;
}

export function projectSurfaces(state: RegistryState, input: { audience: "staff" | "client" | "share"; clientId: string }): StaffSurfaces {
  const staff = input.audience === "staff";
  const clientId = input.clientId;
  const clientChannels = presentClientChannels(state, clientId).channels;
  const nav = state.registry.filter(showsInChannelNav).map((item) => ({
    href: `/c/all/${item.key}`,
    label: item.staffLabel,
    group: "Channels" as const,
  }));
  const clientNav = clientChannels.map((item) => ({
    href: `/c/${clientId}/${clientChannelSlug(item.label)}`,
    label: item.label,
    group: "Channels" as const,
  }));
  const settingRows = state.registry.flatMap((item) => {
    if (item.status === "hidden") return [];
    const connection = connectionFor(state, clientId, item.key);
    if (!connection) return [];
    const healthy = connection.state === "connected";
    return [{
      key: item.key,
      label: staff ? item.staffLabel : item.clientLabel,
      status: settingsStatus(connection),
      access: accessWord(item),
      writeLabel: writeWord(item),
      healthy,
      needsSetup: connection.state === "needs_setup",
      canDisconnect: connection.state === "connected" || connection.state === "needs_reconnect",
      setupName: item.staffLabel,
    }];
  });
  if (staff && !settingRows.some((item) => item.key === "conversion_feedback")) {
    settingRows.push({
      key: "conversion_feedback",
      label: "Conversion feedback",
      status: "Needs setup",
      access: "Read only",
      writeLabel: "PENDING JASON APPROVAL",
      healthy: false,
      needsSetup: true,
      canDisconnect: false,
      setupName: "conversion feedback",
    });
  }
  const commandRows = state.registry.filter(showsInChannelNav).map((item) => {
    const connection = connectionFor(state, clientId, item.key);
    const metrics = { ...metricRow(item, connection) };
    if (!staff) {
      metrics.spend = "—";
      metrics.cpl = "—";
    }
    const surface: SurfaceRow = {
      key: item.key,
      href: `/c/all/${item.key}`,
      name: staff ? item.staffLabel : item.clientLabel,
      spend: metrics.spend,
      leads: metrics.leads,
      cpl: metrics.cpl,
      qualified: metrics.qualified,
      status: metrics.status,
      tone: metrics.tone,
      colourToken: item.colourToken,
    };
    const more = Boolean(item.parentKey) || connection?.state === "needs_setup";
    return { more, surface };
  });
  const more = commandRows.filter((item) => item.more).map((item) => item.surface);
  const connectedLabels = state.registry.flatMap((item) => {
    if (item.status === "hidden") return [];
    const connection = connectionFor(state, clientId, item.key);
    if (connection?.state !== "connected") return [];
    return [staff ? item.staffLabel : item.clientLabel];
  });
  const setupNames = state.registry.flatMap((item) => {
    if (item.status === "hidden") return [];
    const connection = connectionFor(state, clientId, item.key);
    if (connection?.state !== "needs_setup") return [];
    return [item.staffLabel];
  });
  const lines = matchLines(state, clientId, (item) => (staff ? item.staffLabel : item.clientLabel));
  const hold = onHoldSummary(lines);
  const reportChannels = state.registry.flatMap((item) => {
    if (item.status === "hidden") return [];
    if (connectionFor(state, clientId, item.key)?.state !== "connected") return [];
    return [{ id: item.key, staffName: item.staffLabel, clientName: item.clientLabel, color: item.colourToken }];
  });
  return {
    nav,
    clientNav,
    settings: { headline: settingsHeadline(settingRows), rows: settingRows },
    commandCenter: { main: commandRows.filter((item) => !item.more).map((item) => item.surface), more, moreLabel: `More channels (${more.length})` },
    audience: { lines, ...hold },
    resolution: { rows: lines },
    report: {
      blended: `Blended across ${joinAnd(connectedLabels)}`,
      note: setupNames.length === 1 ? `${setupNames[0]} added, needs setup` : setupNames.length > 1 ? `${joinAnd(setupNames)} added, need setup` : null,
      channels: reportChannels,
    },
    clientChannels,
  };
}

export function capabilityCheck(row: PlatformRegistryRow) {
  const emailPhone: CapabilityWord = row.idUpload.email && row.idUpload.phone ? "supported" : row.idUpload.email || row.idUpload.phone ? "partial" : "not supported";
  const household: CapabilityWord = row.idUpload.ipv4 && row.idUpload.ipv6 ? "supported" : row.idUpload.ipv4 || row.idUpload.ipv6 ? "partial" : "not supported";
  const writes: CapabilityWord = row.writesEnabled ? "supported" : row.writeCapable ? "partial" : "not supported";
  return {
    items: [
      { name: "Reporting", result: (row.metrics.length ? "supported" : "not supported") as CapabilityWord },
      { name: "Leads", result: (row.metrics.includes("leads") ? "supported" : "not supported") as CapabilityWord },
      { name: "MAID upload", result: (row.idUpload.maid ? "supported" : "not supported") as CapabilityWord },
      { name: "Hashed email and phone upload", result: emailPhone },
      { name: "IPv4 and IPv6 household upload", result: household },
      { name: "Match-rate reporting", result: (row.matchRateSource ? "supported" : "not supported") as CapabilityWord },
      { name: "Writes", result: writes },
    ],
    matchNote: "Match rate is the share of uploaded people the platform could recognize. Supported means a match-rate row appears after the account is connected. Partial means only some of the ID types can be matched. Not supported means this platform has no match-rate row.",
  };
}

export type TestResult = {
  outcome: TestOutcome;
  saved: boolean;
  testing: "Checking access (up to 30 s)";
  counts?: string;
  access?: string;
  sync?: string;
  alert?: string;
  fix?: string;
  retry?: string;
  connectionStatus?: string;
};

/** Mock sample only. This function does not call the network. */
export function runConnectionTest(input: { platformKey: string; outcome?: TestOutcome }, env: Env = process.env): TestResult {
  const outcome = input.outcome ?? "success";
  void integrationsMode(env);
  void input.platformKey;
  if (outcome === "error") {
    return {
      outcome,
      saved: false,
      testing: "Checking access (up to 30 s)",
      alert: "The sample read was refused.",
      fix: "Check the ad account id and use a read-only key, then retry.",
    };
  }
  if (outcome === "rate_limited") {
    return {
      outcome,
      saved: false,
      testing: "Checking access (up to 30 s)",
      retry: "Rate limited. This check will retry automatically. Nothing was saved.",
    };
  }
  if (outcome === "token_expired") {
    return {
      outcome,
      saved: true,
      testing: "Checking access (up to 30 s)",
      connectionStatus: "Needs reconnect",
      alert: "The token expired.",
      fix: "Reconnect this account. The old token is no longer used.",
    };
  }
  return {
    outcome: "success",
    saved: true,
    testing: "Checking access (up to 30 s)",
    counts: "3 campaigns read",
    access: "Read only",
    sync: "first full sync within 24 h",
  };
}

export function applyConnectionTest(
  state: RegistryState,
  input: { clientId: string; platformKey: string; accountId: string; secret?: string; outcome?: TestOutcome; now?: string },
  env: Env = process.env,
) {
  const platform = platformByKey(state, input.platformKey);
  if (!platform || platform.status === "hidden") return { state, error: "Unknown platform.", result: null as TestResult | null };
  const result = runConnectionTest({ platformKey: input.platformKey, outcome: input.outcome }, env);
  if (!result.saved) return { state, error: null as string | null, result };
  const next = structuredClone(state);
  const now = input.now ?? "2026-10-31T16:00:00Z";
  const tokenRef = input.secret?.trim() ? sealToken(input.secret, env) : connectionFor(next, input.clientId, input.platformKey)?.tokenRef ?? null;
  const existing = next.connections.find((item) => item.clientId === input.clientId && item.platformKey === input.platformKey);
  const stateName: ConnectionStateName = result.outcome === "token_expired" ? "needs_reconnect" : "connected";
  const row: ClientConnectionRow = {
    clientId: input.clientId,
    platformKey: input.platformKey,
    accountId: input.accountId,
    state: stateName,
    lastTestAt: now,
    lastSyncAt: stateName === "connected" ? now : existing?.lastSyncAt ?? null,
    tokenRef,
    writesEnabled: false,
    disconnectedAt: null,
  };
  if (existing) Object.assign(existing, row);
  else next.connections.push(row);
  return { state: next, error: null as string | null, result };
}

export function disconnectConnection(state: RegistryState, input: { clientId: string; platformKey: string; confirmName: string; dateLabel: string }) {
  const platform = platformByKey(state, input.platformKey);
  if (!platform) return { state, ok: false as const, error: "Unknown platform." };
  if (input.confirmName.trim() !== platform.staffLabel) return { state, ok: false as const, error: "Type the platform name to disconnect." };
  const next = structuredClone(state);
  const existing = next.connections.find((item) => item.clientId === input.clientId && item.platformKey === input.platformKey);
  if (!existing || (existing.state !== "connected" && existing.state !== "needs_reconnect")) {
    return { state, ok: false as const, error: "That platform is not connected for this client." };
  }
  existing.state = "disconnected";
  existing.disconnectedAt = input.dateLabel;
  existing.tokenRef = null;
  existing.writesEnabled = false;
  return { state: next, ok: true as const, error: null };
}

export function approvePlatformWrites(state: RegistryState, actor: { name: string; email: string }, platformKey: string, at = "2026-10-31T16:00:00Z") {
  if (!isJasonApproval(actor)) return { state, ok: false as const, error: "Writes stay off until Jason approves this platform." };
  const next = structuredClone(state);
  const platform = platformByKey(next, platformKey);
  if (!platform) return { state, ok: false as const, error: "Unknown platform." };
  platform.writesEnabled = true;
  next.approvals.push({ platformKey, approver: actor.email, at });
  for (const connection of next.connections) {
    if (connection.platformKey === platformKey) connection.writesEnabled = false;
  }
  return { state: next, ok: true as const, error: null };
}

export function recommendBudgetChange(input: { platformKey: string; note: string }) {
  return { platformKey: input.platformKey, recommendation: input.note, executes: false as const, writePath: null };
}

export function platformKeyFromName(name: string) {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  if (!key) throw new Error("Platform name is required.");
  return key;
}

function cleanDocs(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Docs link must be a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Docs link must be a web address.");
  return url.toString();
}

/** Queues the request internally. Nothing is sent outside the app. */
export function submitPlatformRequest(state: RegistryState, input: { name: string; category: string; docsLink?: string; clientId: string; why: string; id?: string; now?: string }) {
  const name = input.name.trim();
  const why = input.why.trim();
  const clientId = input.clientId.trim();
  if (!name) return { state, ok: false as const, error: "Name the platform.", externalSend: false as const };
  if (!CHANNEL_TYPES.includes(input.category as ChannelType)) return { state, ok: false as const, error: "Choose a category.", externalSend: false as const };
  if (!clientId) return { state, ok: false as const, error: "Choose the client.", externalSend: false as const };
  if (!why) return { state, ok: false as const, error: "Say why you need this platform.", externalSend: false as const };
  let docsLink = "";
  try {
    docsLink = cleanDocs(input.docsLink || "");
  } catch (error) {
    return { state, ok: false as const, error: error instanceof Error ? error.message : "Docs link must be a web address.", externalSend: false as const };
  }
  const next = structuredClone(state);
  const request: PlatformRequestRow = {
    id: input.id || `req_${randomBytes(4).toString("hex")}`,
    name,
    category: input.category as ChannelType,
    docsLink,
    clientId,
    why,
    status: "queued",
    decidedBy: "",
    createdAt: input.now ?? "2026-10-31T16:00:00Z",
  };
  next.requests.push(request);
  return { state: next, ok: true as const, error: null, request, externalSend: false as const };
}

function platformFromRequest(request: PlatformRequestRow, key: string): PlatformRegistryRow {
  const label = request.name.trim();
  return {
    key,
    staffLabel: label,
    clientLabel: /ads$/i.test(label) ? label : `${label} ads`,
    channelType: request.category,
    vendor: label,
    parentKey: null,
    auth: "api_key",
    scopesRead: ["read"],
    writeCapable: false,
    writesEnabled: false,
    idUpload: { ...NONE },
    matchRateSource: null,
    metrics: ["leads"],
    hierarchy: "",
    colourToken: "#231F20",
    status: "available",
    aliases: [],
    contracted: false,
  };
}

export function decidePlatformRequest(state: RegistryState, actor: RegistryActor, input: { id: string; decision: "approve" | "decline"; now?: string }) {
  if (!canDecidePlatformRequest(actor)) return { state, status: 403 as const, error: "Not allowed" };
  const next = structuredClone(state);
  const request = next.requests.find((item) => item.id === input.id);
  if (!request) return { state, status: 404 as const, error: "Request not found" };
  if (request.status !== "queued") return { state, status: 400 as const, error: "That request is already decided." };
  request.decidedBy = actor.email;
  request.status = input.decision === "approve" ? "approved" : "declined";
  if (input.decision === "decline") return { state: next, status: 200 as const, error: null, request };
  let key = platformKeyFromName(request.name);
  if (next.registry.some((item) => item.key === key)) key = `${key}_requested`.slice(0, 48);
  const platform = platformFromRequest(request, key);
  next.registry.push(platform);
  return { state: next, status: 200 as const, error: null, request, platform };
}

export type RegistryHttpResult = {
  status: number;
  body: Record<string, unknown>;
  state: RegistryState;
};

function publicRequest(request: PlatformRequestRow) {
  return {
    id: request.id,
    name: request.name,
    category: request.category,
    docsLink: request.docsLink,
    clientId: request.clientId,
    why: request.why,
    status: request.status,
  };
}

/** Server gate for catalog and request actions. Clients receive 403. The switch off is 404. */
export function handleChannelRegistryHttp(input: {
  method: string;
  enabled: boolean;
  actor: RegistryActor | null;
  action?: string;
  body?: Record<string, unknown>;
  state: RegistryState;
  clientId?: string;
}): RegistryHttpResult {
  const state = input.state;
  if (!input.actor) return { status: 401, body: { error: "Sign in required" }, state };
  if (!input.enabled) return { status: 404, body: { error: "Off" }, state };
  if (!canUseChannelRegistry(input.actor)) return { status: 403, body: { error: "Not allowed" }, state };
  const clientId = input.clientId || "harbor";
  if (input.method === "GET") {
    const cards = presentCatalog(state, clientId);
    const body = input.actor.seesCost === false ? stripForAudience({ platforms: cards, requests: state.requests.map(publicRequest) }, "client") : { platforms: cards, requests: state.requests.map(publicRequest) };
    return { status: 200, body: body as Record<string, unknown>, state };
  }
  const action = input.action || String(input.body?.action || "");
  const body = input.body ?? {};
  if (action === "request") {
    const result = submitPlatformRequest(state, {
      name: String(body.name || ""),
      category: String(body.category || ""),
      docsLink: String(body.docsLink || ""),
      clientId: String(body.clientId || ""),
      why: String(body.why || ""),
    });
    if (!result.ok) return { status: 400, body: { error: result.error, externalSend: false }, state };
    return { status: 200, body: { request: publicRequest(result.request), externalSend: false }, state: result.state };
  }
  if (action === "decide") {
    const decision = body.decision === "decline" ? "decline" : body.decision === "approve" ? "approve" : "";
    if (!decision) return { status: 400, body: { error: "Choose approve or decline." }, state };
    const result = decidePlatformRequest(state, input.actor, { id: String(body.id || ""), decision });
    if (result.status !== 200) return { status: result.status, body: { error: result.error }, state };
    const platform = "platform" in result ? result.platform : undefined;
    return {
      status: 200,
      body: { request: result.request ? publicRequest(result.request) : null, ...(platform ? { platform: { key: platform.key, staffLabel: platform.staffLabel, contracted: platform.contracted, status: platform.status } } : {}) },
      state: result.state,
    };
  }
  if (action === "test") {
    const result = applyConnectionTest(state, {
      clientId: String(body.clientId || clientId),
      platformKey: String(body.platformKey || ""),
      accountId: String(body.accountId || ""),
      secret: body.secret ? String(body.secret) : undefined,
      outcome: body.outcome ? (String(body.outcome) as TestOutcome) : undefined,
    });
    if (result.error) return { status: 400, body: { error: result.error }, state };
    const safe = { ...(result.result ?? {}), tokenRef: undefined };
    return { status: 200, body: { result: safe }, state: result.state };
  }
  if (action === "disconnect") {
    const result = disconnectConnection(state, {
      clientId: String(body.clientId || clientId),
      platformKey: String(body.platformKey || ""),
      confirmName: String(body.confirmName || ""),
      dateLabel: String(body.dateLabel || "Oct 31, 2026"),
    });
    if (!result.ok) return { status: 400, body: { error: result.error }, state };
    return { status: 200, body: { ok: true }, state: result.state };
  }
  return { status: 400, body: { error: "Unknown action." }, state };
}

export function overlayStaffReport<T extends {
  subhead: string;
  flags: { id: string; kind: string; title: string; detail: string; href?: string }[];
  channels: { id: string; staffName: string; clientName: string; qualified: number; leads: number; booked: number; cpl: number | null; color: string }[];
}>(report: T, state: RegistryState = exampleRegistryState(), clientId = "harbor"): T {
  const surfaces = projectSurfaces(state, { audience: "staff", clientId });
  const next = structuredClone(report);
  const prefix = next.subhead.includes("·") ? next.subhead.split("·")[0].trim() : next.subhead.trim();
  next.subhead = `${prefix} · ${surfaces.report.blended}`;
  if (surfaces.report.note && !next.flags.some((flag) => flag.title === surfaces.report.note)) {
    next.flags.push({ id: "registry-setup", kind: "heads_up", title: surfaces.report.note, detail: "The platform is in the registry and still needs a successful connection test." });
  }
  const seen = new Set(next.channels.map((item) => item.staffName.toLowerCase()));
  for (const channel of surfaces.report.channels) {
    if (seen.has(channel.staffName.toLowerCase())) continue;
    next.channels.push({ id: channel.id, staffName: channel.staffName, clientName: channel.clientName, qualified: 0, leads: 0, booked: 0, cpl: null, color: channel.color });
  }
  return next;
}

let memory: RegistryState | null = null;

export function registryMemory() {
  if (!memory) memory = exampleRegistryState();
  return memory;
}

export function replaceRegistryMemory(state: RegistryState) {
  memory = state;
  return memory;
}

export function resetRegistryMemory() {
  memory = null;
}

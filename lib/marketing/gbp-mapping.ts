import { GBP_FIXTURE_CLIENTS, gbpFixtures, type GbpFixture } from "./connectors/gbp-fixtures";

export type GbpClientChoice = { id: string; name: string; phone?: string; website?: string };

export type GbpLocationChoice = {
  accountId: string;
  locationId: string;
  title: string;
  phone: string;
  websiteUri: string;
  address: string;
  primaryCategory: string;
};

export type GbpSuggestion = { clientId: string; clientName: string; reason: string };

const memory = new Map<string, string>();

export function exampleGbpAssignments(): Record<string, string> {
  return { "501": "harbor" };
}

export function rememberGbpAssignment(locationId: string, marketingClientId: string) {
  memory.set(locationId, marketingClientId);
}

export function readGbpAssignments(): Record<string, string> {
  return { ...exampleGbpAssignments(), ...Object.fromEntries(memory) };
}

export function resetGbpAssignments(next: Record<string, string> = {}) {
  memory.clear();
  for (const [locationId, clientId] of Object.entries(next)) memory.set(locationId, clientId);
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function host(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function tokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((token) => token.length > 2 && !["the", "and", "inc", "llc"].includes(token));
}

export function suggestGbpClient(location: Pick<GbpLocationChoice, "title" | "phone" | "websiteUri">, clients: readonly GbpClientChoice[]): GbpSuggestion | null {
  const locationHost = host(location.websiteUri);
  const locationPhone = digits(location.phone).slice(-10);
  for (const client of clients) {
    const clientHost = host(client.website || "");
    if (locationHost && clientHost && locationHost === clientHost) {
      return { clientId: client.id, clientName: client.name, reason: `Website matches ${client.name}. Nothing is assigned until you confirm.` };
    }
  }
  for (const client of clients) {
    const clientPhone = digits(client.phone || "").slice(-10);
    if (locationPhone.length === 10 && clientPhone.length === 10 && locationPhone === clientPhone) {
      return { clientId: client.id, clientName: client.name, reason: `Phone matches ${client.name}. Nothing is assigned until you confirm.` };
    }
  }
  const locationTokens = new Set(tokens(location.title));
  let best: { client: GbpClientChoice; score: number } | null = null;
  for (const client of clients) {
    const clientTokens = tokens(client.name);
    if (!clientTokens.length || !locationTokens.size) continue;
    const overlap = clientTokens.filter((token) => locationTokens.has(token)).length;
    const score = overlap / clientTokens.length;
    if (score > 0.66 && (!best || score > best.score)) best = { client, score };
  }
  if (!best) return null;
  return { clientId: best.client.id, clientName: best.client.name, reason: `Name is similar to ${best.client.name}. Nothing is assigned until you confirm.` };
}

export function locationChoices(now?: Date): GbpLocationChoice[] {
  return gbpFixtures(now).map((row) => ({
    accountId: row.accountId,
    locationId: row.locationId,
    title: row.report.title,
    phone: row.report.profile.phone,
    websiteUri: row.report.profile.websiteUri,
    address: [row.report.profile.address.street, row.report.profile.address.city, row.report.profile.address.region].filter(Boolean).join(", "),
    primaryCategory: row.report.profile.primaryCategory,
  }));
}

export function applyGbpAssignment(input: {
  locations: readonly GbpLocationChoice[];
  clients: readonly GbpClientChoice[];
  assignments: Record<string, string>;
  locationId: string;
  marketingClientId: string;
}): { ok: true; assignments: Record<string, string> } | { ok: false; reason: string } {
  const clientId = input.marketingClientId.trim();
  if (!clientId) return { ok: false, reason: "Choose a client. Nothing is assigned on its own." };
  if (!input.locations.some((row) => row.locationId === input.locationId)) return { ok: false, reason: "That location is not in the list." };
  if (!input.clients.some((row) => row.id === clientId)) return { ok: false, reason: "That client is not in the list." };
  return { ok: true, assignments: { ...input.assignments, [input.locationId]: clientId } };
}

export function assignedClientId(assignments: Record<string, string>, locationId: string) {
  return assignments[locationId] || "";
}

export function fixturesForClient(clientId: string, assignments: Record<string, string>, now?: Date): GbpFixture[] {
  return gbpFixtures(now).filter((row) => assignments[row.locationId] === clientId);
}

export function defaultGbpClients(): GbpClientChoice[] {
  return GBP_FIXTURE_CLIENTS.map((client) => ({ ...client }));
}

import { collectsCostKeys, stripForAudience } from "./channels/cost-strip";

/** Field names a client owner, client viewer, or share link must never receive. */
export const CLIENT_COST_FIELDS = ["spend", "budget", "cost", "cpl", "cpql", "roas"] as const;

export type ContractAudience = "client_owner" | "client_viewer" | "share" | "account_manager" | "super_admin" | "staff" | "all_clients_viewer" | "none";

export type ScopedRead<T> =
  | { ok: true; body: T }
  | { ok: false; status: 403; error: "Not allowed" };

const CLIENT_AUDIENCES = new Set<ContractAudience>(["client_owner", "client_viewer", "share"]);

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/** True when a JSON key is spend, budget, cost, CPL, CPQL, or ROAS, including compounds such as costPerLead. */
export function isClientCostField(key: string) {
  const token = normalizedKey(key);
  if (!token || token === "coastal") return false;
  if (token.includes("cpql")) return true;
  if (token === "cpl" || token.endsWith("cpl")) return true;
  if (token.includes("roas") || token.includes("spend") || token.includes("budget")) return true;
  if (token === "cost" || token.startsWith("cost") || token.endsWith("cost") || token.includes("costper")) return true;
  return false;
}

export function clientCostFields(value: unknown, found: string[] = [], trail = ""): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => clientCostFields(item, found, `${trail}[${index}]`));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isClientCostField(key)) found.push(`${trail}.${key}`);
      clientCostFields(child, found, `${trail}.${key}`);
    }
  }
  return found;
}

/**
 * Client owners, client viewers, and share links lose cost fields.
 * An account manager only receives a client they are assigned to.
 */
export function readScopedClient<T>(input: {
  kind: ContractAudience;
  ownClientId: string;
  assignedClientIds: readonly string[];
  requestedClientId: string;
  payload: T;
}): ScopedRead<T> {
  const requested = input.requestedClientId.trim();
  if (input.kind === "none") return { ok: false, status: 403, error: "Not allowed" };
  if (CLIENT_AUDIENCES.has(input.kind)) {
    const own = input.ownClientId.trim();
    if (!own || !requested || requested !== own) return { ok: false, status: 403, error: "Not allowed" };
    const audience = input.kind === "share" ? "share" : "client";
    return { ok: true, body: stripForAudience(input.payload, audience) };
  }
  if (input.kind === "account_manager") {
    if (!requested || !input.assignedClientIds.includes(requested)) {
      return { ok: false, status: 403, error: "Not allowed" };
    }
    return { ok: true, body: input.payload };
  }
  return { ok: true, body: input.payload };
}

/** Every client, viewer, and share response for one endpoint. An account manager asking for someone else's client is refused. */
export function contractEndpoint<T>(payload: T, input: {
  ownClientId: string;
  assignedClientIds: readonly string[];
  requestedClientId: string;
}) {
  const audiences: ContractAudience[] = ["client_owner", "client_viewer", "share"];
  const bodies = audiences.map((kind) => {
    const read = readScopedClient({ kind, payload, ...input, requestedClientId: input.ownClientId });
    return { kind, read };
  });
  const foreign = readScopedClient({
    kind: "account_manager",
    payload,
    ownClientId: input.ownClientId,
    assignedClientIds: input.assignedClientIds,
    requestedClientId: input.requestedClientId,
  });
  return { bodies, foreign };
}

export function scopedBodyIsClean(body: unknown) {
  return clientCostFields(body).length === 0 && collectsCostKeys(body).length === 0;
}

export type TrustTier = "proprietary" | "crm" | "platform_reported";
export type TruthRole = "ground_truth" | "audience" | "delivery_only";

export const TRUST_WEIGHT: Record<TrustTier, number> = {
  proprietary: 3,
  crm: 2,
  platform_reported: 1,
};

/** CRM closed-loop labels outrank audience files. Platform exports are never conversion truth. */
export const TRUTH_RANK: Record<TruthRole, number> = {
  ground_truth: 3,
  audience: 2,
  delivery_only: 0,
};

export type ProvenanceDriver = {
  sourceId: string;
  sourceLabel: string;
  metricKey: string;
  trustTier: TrustTier;
  truthRole: TruthRole;
  vendor?: string;
  listId?: string;
};

export function trustForAudience(source: string): { trustTier: TrustTier; truthRole: TruthRole } {
  if (source === "crm_first_party") return { trustTier: "crm", truthRole: "ground_truth" };
  if (source === "maid_market" || source === "pixel_pool" || source === "verified_human_source") {
    return { trustTier: "proprietary", truthRole: "audience" };
  }
  return { trustTier: "platform_reported", truthRole: "delivery_only" };
}

export function driverWeight(driver: ProvenanceDriver) {
  if (driver.truthRole === "delivery_only") return 0;
  return TRUST_WEIGHT[driver.trustTier] * Math.max(TRUTH_RANK[driver.truthRole], 1);
}

export function buildProvenance(drivers: ProvenanceDriver[]) {
  const ranked = [...drivers]
    .map((driver) => ({ ...driver, weight: driverWeight(driver) }))
    .sort((a, b) => b.weight - a.weight || a.sourceLabel.localeCompare(b.sourceLabel));
  const used = ranked.filter((driver) => driver.weight > 0);
  const delivery = ranked.filter((driver) => driver.truthRole === "delivery_only");
  const parts = used.map((driver) => {
    const list = driver.listId ? ` list ${driver.listId}` : "";
    const vendor = driver.vendor ? ` from ${driver.vendor}` : "";
    return `${driver.sourceLabel}${list}${vendor} (${driver.metricKey}, weight ${driver.weight})`;
  });
  const deliveryNote = delivery.length
    ? " Platform reports were used for delivery and cost only, not as conversion truth."
    : "";
  const line = parts.length ? `Based on: ${parts.join("; ")}.${deliveryNote}` : "Based on: no qualified source yet.";
  return {
    drivers: ranked,
    line,
    usedPlatformAsConversionTruth: false,
  };
}

/** Cross-client learning stays off unless this client consented and at least 3 clients contributed. */
export function crossClientLearningAllowed(consent: boolean, contributingClients: number) {
  return consent === true && contributingClients >= 3;
}

import type { CtvConversion, CtvExposure, CtvHousehold, CtvLink, CtvMatchMethod } from "./types";
import { IP_LOOKBACK_DAYS, lagHours } from "./windows";

const CONFIDENCE: Record<CtvMatchMethod, number> = {
  deterministic_maid: 1,
  ip_device_graph: 0.8,
  probabilistic: 0.4,
};

function householdFor(households: CtvHousehold[], householdId: string) {
  return households.find((row) => row.householdId === householdId) ?? null;
}

function methodFor(exposure: CtvExposure, conversion: CtvConversion, household: CtvHousehold | null, lag: number): CtvMatchMethod | null {
  const maid = exposure.maid && conversion.maid && exposure.maid === conversion.maid;
  const linkedMaid = Boolean(household && conversion.maid && household.linkedMaids.includes(conversion.maid) && household.householdId === exposure.householdId);
  if (maid || linkedMaid || (household?.matchMethod === "deterministic_maid" && household.householdId && household.householdId === exposure.householdId && household.householdId === conversion.householdId)) {
    return "deterministic_maid";
  }
  const sameHousehold = Boolean(exposure.householdId && exposure.householdId === conversion.householdId);
  const sameDevice = Boolean(exposure.deviceType && exposure.deviceType === conversion.deviceType);
  const sameIp = Boolean(exposure.ipHash && exposure.ipHash === conversion.ipHash);
  const ipFresh = lag >= 0 && lag <= IP_LOOKBACK_DAYS * 24;
  if ((sameIp && sameDevice && ipFresh) || (sameHousehold && household?.matchMethod === "ip_device_graph")) return "ip_device_graph";
  const cookie = Boolean(household && conversion.cookie && household.linkedCookies.includes(conversion.cookie));
  if ((sameIp && ipFresh) || cookie || (sameHousehold && household?.matchMethod === "probabilistic")) return "probabilistic";
  if (sameHousehold && ipFresh) return sameDevice ? "ip_device_graph" : "probabilistic";
  return null;
}

/** Build candidate links. IP matches older than 30 days are dropped. Raw IPs never enter this function. */
export function linkTouchpoints(exposures: CtvExposure[], conversions: CtvConversion[], households: CtvHousehold[]): CtvLink[] {
  const links: CtvLink[] = [];
  for (const exposure of exposures) {
    const household = householdFor(households, exposure.householdId);
    for (const conversion of conversions) {
      if (exposure.maidListId && conversion.maidListId && exposure.maidListId !== conversion.maidListId) continue;
      const lag = lagHours(exposure.ts, conversion.ts);
      if (lag == null || lag < 0) continue;
      const method = methodFor(exposure, conversion, household, lag);
      if (!method) continue;
      if ((method === "ip_device_graph" || method === "probabilistic") && lag > IP_LOOKBACK_DAYS * 24) continue;
      links.push({
        exposureEventId: exposure.eventId,
        conversionId: conversion.conversionId,
        linkType: exposure.interaction,
        matchMethod: method,
        matchConfidence: household && household.householdId === exposure.householdId ? household.matchConfidence || CONFIDENCE[method] : CONFIDENCE[method],
        lagHours: lag,
        counted: false,
      });
    }
  }
  return links;
}

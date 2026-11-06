import { connectionSlugOk } from "../prospects/connections";
import { analyticsConnectionKey, storedAnalyticsConnection } from "./connections";

export type AnalyticsScopeData = {
  googleAnalyticsConnectionName: string;
  googleAnalyticsPropertyId: string;
};

/**
 * Fields the mapping helper may write.
 * Live-read flags and every other client column stay out of this object.
 */
export function analyticsScopeData(input: { connection?: string | null; propertyId: string }):
  | { ok: true; data: AnalyticsScopeData }
  | { ok: false; reason: string } {
  const propertyId = input.propertyId.trim();
  if (!/^\d{6,12}$/.test(propertyId)) return { ok: false, reason: "property id must be the GA4 numeric id" };
  const connection = analyticsConnectionKey(input.connection);
  if (!connectionSlugOk(connection)) return { ok: false, reason: "connection name must be a short slug" };
  return {
    ok: true,
    data: {
      googleAnalyticsConnectionName: storedAnalyticsConnection(connection),
      googleAnalyticsPropertyId: propertyId,
    },
  };
}

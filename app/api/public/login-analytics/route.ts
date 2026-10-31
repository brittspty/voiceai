import { NextResponse } from "next/server";
import { zonedISODate } from "@/lib/time";
import {
  ANALYTICS_ZONE,
  clientIp,
  createAnalyticsCache,
  createLoginAnalyticsLimiter,
  handlePublicLoginAnalytics,
} from "@/lib/login-analytics";
import { loadLoginContributions } from "@/lib/login-analytics-query";

export const dynamic = "force-dynamic";

const limiter = createLoginAnalyticsLimiter();
const cache = createAnalyticsCache();

export async function GET(request: Request) {
  const result = await handlePublicLoginAnalytics({
    env: process.env,
    now: Date.now(),
    ip: clientIp(request),
    limiter,
    cache,
    load: (now) => loadLoginContributions(now),
    zoneISO: (asOf) => zonedISODate(asOf, ANALYTICS_ZONE),
  });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

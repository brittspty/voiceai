import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { holdoutsEnabled } from "@/lib/marketing/config";
import { canViewHoldouts, featureHttpStatus } from "@/lib/marketing/feature-access";
import { listHoldoutTests } from "@/lib/marketing/holdout-store";
import { holdoutProgress, viewStoredLift, type LiftVerdict } from "@/lib/marketing/holdouts";
import { loadMarketingAccess } from "@/lib/marketing/queries";

function num(value: { toString(): string } | null) {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const status = featureHttpStatus({ enabled: holdoutsEnabled(), allowed: canViewHoldouts(access) && access.workspaceId.length > 0 });
  if (status !== 200) return NextResponse.json({ error: status === 404 ? "Not found" : "Not allowed" }, { status });
  const tests = await listHoldoutTests(access);
  return NextResponse.json({
    seesCost: access.seesCost,
    tests: tests.map((test) => {
      const latest = test.results[0];
      const readout = latest
        ? viewStoredLift({
            ready: latest.ready,
            verdict: latest.verdict as LiftVerdict,
            method: latest.method,
            sentence: latest.sentence,
            extraLeads: num(latest.extraLeads),
            rangeLow: num(latest.rangeLow),
            rangeHigh: num(latest.rangeHigh),
            confidence: num(latest.confidence),
            extraLeadCost: num(latest.extraLeadCost),
          }, access.seesCost)
        : null;
      return {
        id: test.id,
        name: test.name,
        question: test.question,
        status: test.status,
        campaign: test.campaign.name,
        progress: holdoutProgress(test.startDate.toISOString().slice(0, 10), test.endDate.toISOString().slice(0, 10)),
        readout,
      };
    }),
  });
}

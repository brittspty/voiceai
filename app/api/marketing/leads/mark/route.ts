import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { leadScoringEnabled } from "@/lib/marketing/config";
import { decideLeadMark } from "@/lib/marketing/lead-score/permissions";
import { markPayload, payloadHasCost } from "@/lib/marketing/lead-score/present";
import { leadScopeFor } from "@/lib/marketing/lead-score/scope";
import { markLeads } from "@/lib/marketing/lead-score/store";
import { loadMarketingAccess } from "@/lib/marketing/queries";

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  mark: z.enum(["qualified", "unqualified", "spam", "clear"]),
  reason: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  if (!leadScoringEnabled()) return NextResponse.json({ error: "Lead scoring is off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await loadMarketingAccess(user);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the lead and the mark." }, { status: 400 });
  const decision = decideLeadMark(access, parsed.data.mark);
  if (!decision.ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const scope = leadScopeFor(access);
  const saved = await markLeads({
    ids: parsed.data.ids,
    label: decision.label,
    reason: parsed.data.reason ?? "",
    user,
    scope,
  });
  if (!saved.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const payload = { ok: true as const, rows: saved.map(markPayload) };
  if (payloadHasCost(payload)) return NextResponse.json({ error: "Not allowed" }, { status: 500 });
  return NextResponse.json(payload);
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appUrl, publicHttpsBase } from "@/lib/env";
import { isAccessDenied } from "@/lib/deny";
import { reportsP1Enabled, reportsV2Enabled } from "@/lib/marketing/config";
import { createShareLink, revokeShareLink } from "@/lib/marketing/human-actions";
import { sealClientReport } from "@/lib/marketing/client-view";
import { buildReport } from "@/lib/marketing/reports/guard";
import { loadStaffReport } from "@/lib/marketing/reports/load";
import { isLiveShareMarker, shareBody } from "@/lib/marketing/reports/p1/share";
import { parseReportQuery } from "@/lib/marketing/reports/query";
import { isSixDigitPasscode, shareExpiryForDays, shareLinkLabel } from "@/lib/marketing/share-link";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

function off() {
  return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
}

export async function GET() {
  if (!reportsV2Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const built = await buildReport(user, {});
  if (!built?.canShare) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const links = await prisma.clientShareLink.findMany({
    where: { workspaceId: WORKSPACE_ID, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { _count: { select: { views: true } } },
  });
  return NextResponse.json({
    links: links
      .filter((link) => link.snapshot != null)
      .map((link) => {
        const row: { id: string; label: string; views: number; expires: string; passcode: boolean; live?: boolean } = {
          id: link.id,
          label: link.label || "Report link",
          views: link._count.views,
          expires: shareLinkLabel(link),
          passcode: Boolean(link.passcodeHash),
        };
        if (isLiveShareMarker(link.snapshot)) row.live = true;
        return row;
      }),
  });
}

export async function POST(request: Request) {
  if (!reportsV2Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = (await request.json()) as { days?: number; passcode?: string; query?: string; keepLive?: boolean };
    const params = new URLSearchParams(body.query || "");
    const parsed = parseReportQuery(Object.fromEntries(params.entries()));
    const staff = await loadStaffReport({
      range: parsed.range,
      compare: parsed.compare,
      clientId: parsed.clientId || "all",
      start: parsed.start,
      end: parsed.end,
    });
    const sealed = sealClientReport(staff);
    const snapshot = shareBody({ enabled: reportsP1Enabled(), keepLive: body.keepLive === true, sealed, query: parsed });
    const passcode = (body.passcode || "").trim();
    if (passcode && !isSixDigitPasscode(passcode)) {
      return NextResponse.json({ error: "Use a 6-digit passcode." }, { status: 400 });
    }
    const expiresAt = shareExpiryForDays(Number(body.days) || 30);
    const created = await createShareLink({
      label: `${sealed.clientName} · ${sealed.pdf.periodName}${isLiveShareMarker(snapshot) ? " · live" : ""}`.slice(0, 120),
      expiresAt: expiresAt.toISOString(),
      passcode: passcode || null,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    });
    const base = publicHttpsBase() ?? appUrl();
    return NextResponse.json({
      id: created.id,
      url: `${base}/share/${created.token}`,
      passcode: passcode || null,
      expires: shareLinkLabel({ revokedAt: null, expiresAt }),
      label: `${sealed.clientName} · ${sealed.pdf.periodName}`,
      live: isLiveShareMarker(snapshot),
    });
  } catch (error) {
    if (isAccessDenied(error)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const message = error instanceof Error ? error.message : "Could not create the link";
    const status = /turned off|can't|outside|cost fields/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  if (!reportsV2Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "Missing link" }, { status: 400 });
    await revokeShareLink(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAccessDenied(error)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const message = error instanceof Error ? error.message : "Could not revoke the link";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

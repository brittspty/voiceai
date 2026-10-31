import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appUrl, publicHttpsBase } from "@/lib/env";
import { isAccessDenied } from "@/lib/deny";
import { reportsV2Enabled } from "@/lib/marketing/config";
import { createShareLink, revokeShareLink } from "@/lib/marketing/human-actions";
import { sealClientReport } from "@/lib/marketing/client-view";
import { buildReport } from "@/lib/marketing/reports/guard";
import { loadStaffReport } from "@/lib/marketing/reports/load";
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
      .map((link) => ({
        id: link.id,
        label: link.label || "Report link",
        views: link._count.views,
        expires: shareLinkLabel(link),
        passcode: Boolean(link.passcodeHash),
      })),
  });
}

export async function POST(request: Request) {
  if (!reportsV2Enabled()) return off();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = (await request.json()) as { days?: number; passcode?: string; query?: string };
    const params = new URLSearchParams(body.query || "");
    const parsed = parseReportQuery(Object.fromEntries(params.entries()));
    const staff = await loadStaffReport({
      range: parsed.range,
      compare: parsed.compare,
      clientId: parsed.clientId || "all",
      start: parsed.start,
      end: parsed.end,
    });
    const snapshot = sealClientReport(staff);
    const passcode = (body.passcode || "").trim();
    if (passcode && !isSixDigitPasscode(passcode)) {
      return NextResponse.json({ error: "Use a 6-digit passcode." }, { status: 400 });
    }
    const expiresAt = shareExpiryForDays(Number(body.days) || 30);
    const created = await createShareLink({
      label: `${snapshot.clientName} · ${snapshot.pdf.periodName}`.slice(0, 120),
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
      label: `${snapshot.clientName} · ${snapshot.pdf.periodName}`,
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

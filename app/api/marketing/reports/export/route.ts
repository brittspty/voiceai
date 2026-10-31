import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { reportsV2Enabled } from "@/lib/marketing/config";
import { buildReport } from "@/lib/marketing/reports/guard";
import { buildReportPdf } from "@/lib/marketing/reports/pdf";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!reportsV2Enabled()) return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const built = await buildReport(user, query);
  if (!built) return NextResponse.json({ error: "Reports are turned off" }, { status: 404 });
  const pdf = buildReportPdf(built.report);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${built.report.clientName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

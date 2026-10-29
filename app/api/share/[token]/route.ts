import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientShareCsv } from "@/lib/marketing/client-view";
import { loadClientPerformance, recordClientView } from "@/lib/marketing/queries";
import { requestClientMeta } from "@/lib/marketing/request-meta";
import { hashShareToken, SHARE_PASS_COOKIE, shareAccessDecision, shareLinkState } from "@/lib/marketing/share-link";

function shareResponse(response: NextResponse) {
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

async function openLink(token: string) {
  const link = await prisma.clientShareLink.findUnique({ where: { tokenHash: hashShareToken(token) } });
  const state = shareLinkState(link, new Date());
  return { link, state };
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const { link, state } = await openLink(token);
  const jar = await cookies();
  const decision = shareAccessDecision({
    state,
    linkId: link?.id ?? "",
    passcodeHash: link?.passcodeHash ?? null,
    cookie: jar.get(SHARE_PASS_COOKIE)?.value,
  });
  if (decision === "disabled") return shareResponse(NextResponse.json({ error: "Client links are turned off" }, { status: 404 }));
  if (decision === "passcode") return shareResponse(NextResponse.json({ error: "This link needs a code." }, { status: 401 }));
  if (decision !== "ok" || !link) return shareResponse(NextResponse.json({ error: "Link not found" }, { status: 404 }));
  const org = await prisma.org.findUnique({ where: { id: "org" }, select: { name: true } });
  const payload = await loadClientPerformance(org?.name || "Performance");
  const meta = requestClientMeta(request.headers);
  const url = new URL(request.url);
  const isExport = url.pathname.endsWith("/export");
  await recordClientView({
    workspaceId: link.workspaceId,
    shareLinkId: link.id,
    page: isExport ? "/api/share/export" : "/api/share",
    ...meta,
  });
  if (isExport) {
    return shareResponse(new NextResponse(clientShareCsv(payload), { headers: { "Content-Type": "text/csv; charset=utf-8" } }));
  }
  return shareResponse(NextResponse.json(payload));
}

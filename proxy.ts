import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rewriteForDemoHost } from "@/lib/demo/routes";
import { envForProxy, gateDecision } from "@/lib/public-routing";
import { readToken, SESSION_COOKIE } from "@/lib/session-token";

function withPath(request: NextRequest, rewriteUrl?: URL) {
  const headers = new Headers(request.headers);
  headers.set("x-voiceops-path", request.nextUrl.pathname);
  const response = rewriteUrl ? NextResponse.rewrite(rewriteUrl, { request: { headers } }) : NextResponse.next({ request: { headers } });
  const path = rewriteUrl?.pathname || request.nextUrl.pathname;
  if (path.startsWith("/share") || path.startsWith("/api/share") || path.startsWith("/plan") || path.startsWith("/demo")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return response;
}

export async function proxy(request: NextRequest, envOverride?: unknown) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const demoPath = rewriteForDemoHost(host, pathname);
  const effectivePath = demoPath && demoPath !== pathname ? demoPath : pathname;
  const env = envForProxy(envOverride);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = await readToken(token);
  const signedIn = payload?.kind === "session";
  const decision = gateDecision({
    pathname: effectivePath,
    signedIn,
    role: payload?.kind === "session" ? payload.role : null,
    env,
  });
  if (decision.action === "json") return NextResponse.json({ error: decision.error }, { status: decision.status });
  if (decision.action === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
    if (decision.clearSearch) url.search = "";
    if (decision.next) url.searchParams.set("next", decision.next);
    return NextResponse.redirect(url);
  }
  if (decision.action === "rewrite" || effectivePath !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = decision.action === "rewrite" ? decision.pathname : effectivePath;
    return withPath(request, url);
  }
  return withPath(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { demoViewerGate } from "@/lib/demo/isolation";
import { rewriteForDemoHost } from "@/lib/demo/routes";
import { clientViewerBlock } from "@/lib/marketing/client-gate";
import { readToken, SESSION_COOKIE } from "@/lib/session-token";

const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/privacy", "/terms", "/contact", "/request-access", "/invite/", "/api/auth/", "/api/webhooks/", "/api/health", "/share", "/api/share", "/demo", "/plan", "/api/demo"];

function withPath(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-voiceops-path", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  const path = request.nextUrl.pathname;
  if (path.startsWith("/share") || path.startsWith("/api/share") || path.startsWith("/plan") || path.startsWith("/demo")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const asset = request.nextUrl.pathname.startsWith("/_next") || request.nextUrl.pathname.includes(".");
  const rewritten = asset ? null : rewriteForDemoHost(host, request.nextUrl.pathname);
  if (rewritten && rewritten !== request.nextUrl.pathname) {
    const url = request.nextUrl.clone();
    url.pathname = rewritten;
    return NextResponse.rewrite(url);
  }
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
    return NextResponse.next();
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = await readToken(token);
  const signedIn = payload?.kind === "session";
  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
  if (!signedIn && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (signedIn && payload?.kind === "session" && payload.role === "demo_viewer" && demoViewerGate(pathname) === "demo") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = "/demo";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && payload?.kind === "session" && payload.role === "client_viewer") {
    const block = clientViewerBlock(pathname);
    if (block === "deny") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    if (block === "redirect") {
      const url = request.nextUrl.clone();
      url.pathname = "/marketing/client";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = payload?.kind === "session" && payload.role === "client_viewer" ? "/marketing/client" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return withPath(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

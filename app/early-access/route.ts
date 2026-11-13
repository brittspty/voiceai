import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { publicHomepageEnabled } from "@/lib/public-routing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOURCE = join(process.cwd(), "content/early-access/source.html");

/** Relative URLs resolve from /early-access. */
export function earlyAccessHtml() {
  return readFileSync(SOURCE);
}

export function GET() {
  if (!publicHomepageEnabled()) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return new NextResponse(new Uint8Array(earlyAccessHtml()), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

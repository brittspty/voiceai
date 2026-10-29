import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAccessDenied } from "@/lib/deny";
import { createShareLink } from "@/lib/marketing/human-actions";
import { publicHttpsBase } from "@/lib/env";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = (await request.json()) as { label?: string; expiresAt?: string | null; passcode?: string | null };
    const base = publicHttpsBase();
    if (!base) return NextResponse.json({ error: "The public site address is not set." }, { status: 400 });
    const created = await createShareLink({ label: body.label, expiresAt: body.expiresAt, passcode: body.passcode });
    return NextResponse.json({ url: `${base}/share/${created.token}` });
  } catch (error) {
    if (isAccessDenied(error)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const message = error instanceof Error ? error.message : "Could not create the link";
    const status = /turned off|can't|outside/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

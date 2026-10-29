import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createShareLink } from "@/lib/marketing/human-actions";
import { appUrl } from "@/lib/env";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = (await request.json()) as { label?: string; expiresAt?: string | null; passcode?: string | null };
    const created = await createShareLink({ label: body.label, expiresAt: body.expiresAt, passcode: body.passcode });
    return NextResponse.json({ url: `${appUrl()}/share/${created.token}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the link";
    const status = /turned off|can't|outside/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { conversionAccess } from "@/lib/marketing/offline/access";
import { loadConversionFeedback } from "@/lib/marketing/offline/persist";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = conversionAccess(user);
  if (!access.ok) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const view = await loadConversionFeedback(access.seesValue);
  return NextResponse.json(view);
}

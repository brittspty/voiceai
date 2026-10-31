import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { defaultPushPrefs, parsePushPrefs, pushHttpStatus, pushNotificationsEnabled, type PushPrefs } from "@/lib/push/notify";
import { parsePushSubscription, subscriptionStored } from "@/lib/push/subscription";

function statusFor(input: { signedIn: boolean; kind: string | null; share?: boolean }) {
  return pushHttpStatus({ enabled: pushNotificationsEnabled(), signedIn: input.signedIn, kind: input.kind, share: Boolean(input.share) });
}

function fromRow(row: {
  optedIn: boolean;
  quietStartHour: number;
  quietEndHour: number;
  urgentOutageBreaksQuiet: boolean;
  timeZone: string;
}): PushPrefs {
  return {
    optedIn: row.optedIn,
    quietStartHour: row.quietStartHour,
    quietEndHour: row.quietEndHour,
    urgentOutageBreaksQuiet: row.urgentOutageBreaksQuiet,
    timeZone: row.timeZone,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  const access = user ? await loadMarketingAccess(user) : null;
  const status = statusFor({ signedIn: Boolean(user), kind: access?.kind ?? null });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  if (status === 401) return NextResponse.json({ error: "Sign in required" }, { status });
  if (status !== 200 || !user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const row = await prisma.pushPreference.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ prefs: row ? fromRow(row) : defaultPushPrefs(), subscriptionStored: subscriptionStored(row?.subscription), delivery: "would send" });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const access = user ? await loadMarketingAccess(user) : null;
  const status = statusFor({ signedIn: Boolean(user), kind: access?.kind ?? null });
  if (status === 404) return NextResponse.json({ error: "Off" }, { status });
  if (status === 401) return NextResponse.json({ error: "Sign in required" }, { status });
  if (status !== 200 || !user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const type = request.headers.get("content-type") || "";
  const raw = type.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  const body = raw as Record<string, unknown>;
  const prefs = parsePushPrefs({
    optedIn: body.optedIn === true || body.optedIn === "on" || body.optedIn === "true",
    quietStartHour: Number(body.quietStartHour),
    quietEndHour: Number(body.quietEndHour),
    urgentOutageBreaksQuiet: body.urgentOutageBreaksQuiet === true || body.urgentOutageBreaksQuiet === "on" || body.urgentOutageBreaksQuiet === "true",
    timeZone: typeof body.timeZone === "string" ? body.timeZone : undefined,
  });
  const subscription = prefs.optedIn ? parsePushSubscription(body.subscription) : null;
  const subscriptionWrite = prefs.optedIn ? (subscription ? { subscription } : {}) : { subscription: Prisma.DbNull };
  await prisma.pushPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...prefs, ...(subscription ? { subscription } : {}) },
    update: { ...prefs, ...subscriptionWrite },
  });
  if (!type.includes("application/json")) {
    return NextResponse.redirect(new URL("/notifications?saved=1", request.url), 303);
  }
  return NextResponse.json({ prefs, subscriptionStored: Boolean(subscription), delivery: "would send" });
}

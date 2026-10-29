import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAccessDenied } from "@/lib/deny";
import { createClientViewer } from "@/lib/marketing/human-actions";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = (await request.json()) as { name?: string; email?: string; password?: string };
    const created = await createClientViewer({
      name: body.name || "",
      email: body.email || "",
      password: body.password || "",
    });
    return NextResponse.json({ id: created.id, email: created.email });
  } catch (error) {
    if (isAccessDenied(error)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const message = error instanceof Error ? error.message : "Could not add the viewer";
    const status = /can't|Not allowed/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

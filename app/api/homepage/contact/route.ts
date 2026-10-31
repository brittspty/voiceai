import { NextResponse } from "next/server";
import { acceptHomepageContact, contactOriginAllowed } from "@/lib/homepage-contact";

function originOf(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

async function fieldsOf(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string; company?: string; message?: string };
    return { form: false, fields: body };
  }
  const data = await request.formData();
  return {
    form: true,
    fields: {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      company: String(data.get("company") || ""),
      message: String(data.get("message") || ""),
    },
  };
}

export async function POST(request: Request) {
  const { form, fields } = await fieldsOf(request);
  const result = await acceptHomepageContact({
    fields,
    form,
    originAllowed: contactOriginAllowed(request),
  });
  if (result.status === 303) return NextResponse.redirect(new URL(result.location, originOf(request)), 303);
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}

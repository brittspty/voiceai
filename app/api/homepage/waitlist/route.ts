import { NextResponse } from "next/server";
import { acceptAgencyWaitlist, requestIp, type WaitlistInput, type WaitlistResult, type WaitlistStore } from "@/lib/agency-waitlist";
import { contactOriginAllowed } from "@/lib/homepage-contact";
import { requestOrigin } from "@/lib/hosts";

function originOf(request: Request) {
  return requestOrigin(request);
}

async function fieldsOf(request: Request): Promise<{ form: boolean; fields: WaitlistInput }> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as WaitlistInput;
    return { form: false, fields: body && typeof body === "object" ? body : {} };
  }
  const data = await request.formData();
  return {
    form: true,
    fields: {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      agency: String(data.get("agency") || ""),
      website: String(data.get("website") || ""),
      clients: String(data.get("clients") || ""),
      spend: String(data.get("spend") || ""),
      message: String(data.get("message") || ""),
      company_fax: String(data.get("company_fax") || ""),
    },
  };
}

function formJson(result: WaitlistResult) {
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.status === 429) return NextResponse.json({ error: result.error }, { status: 429 });
  if (result.status === 500) return NextResponse.json({ error: result.error }, { status: 500 });
  if (result.status === 200) return NextResponse.json({ ok: true, id: result.id });
  return NextResponse.json({ error: "failed" }, { status: 500 });
}

/** JSON mode used by the early-access page. 2xx only after a row is saved. */
function jsonMode(result: WaitlistResult) {
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  if (result.status === 429) return NextResponse.json({ ok: false, error: "limited" }, { status: 429 });
  if (result.status === 500) return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  if (result.status === 200 && result.id) return NextResponse.json({ ok: true }, { status: 200 });
  return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
}

export async function handleWaitlistPost(request: Request, store?: WaitlistStore) {
  const { form, fields } = await fieldsOf(request);
  try {
    const result = await acceptAgencyWaitlist({
      fields,
      form,
      store,
      originAllowed: contactOriginAllowed(request),
      ip: requestIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")),
    });
    if (result.status === 303) return NextResponse.redirect(new URL(result.location, originOf(request)), 303);
    return form ? formJson(result) : jsonMode(result);
  } catch (error) {
    if (form) throw error;
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleWaitlistPost(request);
}

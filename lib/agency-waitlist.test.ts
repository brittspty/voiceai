import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { PublicHomepage } from "../components/public-homepage";
import { POST } from "../app/api/homepage/waitlist/route";
import { proxy } from "../proxy";
import {
  CLIENT_COUNT_OPTIONS,
  MONTHLY_SPEND_OPTIONS,
  WAITLIST_LIMIT,
  acceptAgencyWaitlist,
  cleanWebsite,
  resetWaitlistLimits,
  waitlistDraft,
  type WaitlistDraft,
  type WaitlistStore,
} from "./agency-waitlist";
import { homepageModel, homepageProse } from "./homepage-content";
import { clientViewerAllowed } from "./marketing/client-gate";
import { SESSION_COOKIE, signToken } from "./session-token";

const ORIGIN = "http://voiceops.test";

function sourceOf(file: string) {
  return readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

function storeOf() {
  const saved: WaitlistDraft[] = [];
  const store: WaitlistStore = {
    create: async (data) => {
      saved.push(data);
      return { id: "wait-1" };
    },
  };
  return { saved, store };
}

function request(pathname: string, token?: string) {
  const headers = new Headers();
  if (token !== undefined) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new NextRequest(`${ORIGIN}${pathname}`, { headers });
}

function post(body: unknown, ip: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/homepage/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, host: "voiceops.test", ...headers },
    body: JSON.stringify(body),
  });
}

async function withHomepage<T>(value: string | undefined, run: () => Promise<T>) {
  const previous = process.env.PUBLIC_HOMEPAGE;
  if (value === undefined) delete process.env.PUBLIC_HOMEPAGE;
  else process.env.PUBLIC_HOMEPAGE = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_HOMEPAGE;
    else process.env.PUBLIC_HOMEPAGE = previous;
  }
}

test("waitlist fields are validated and a honeypot is not stored", async () => {
  assert.equal(cleanWebsite(""), "");
  assert.equal(cleanWebsite("north.example"), "north.example");
  assert.equal(cleanWebsite("https://north.example/path"), "https://north.example/path");
  assert.equal(cleanWebsite("javascript:alert(1)"), null);
  assert.equal(cleanWebsite("not a website"), null);

  const missing = waitlistDraft({ name: "Ada", email: "ada@example.com", agency: "  " });
  assert.equal(missing.ok, false);
  const email = waitlistDraft({ name: "Ada", email: "ada@example", agency: "North" });
  assert.equal(email.ok, false);
  const site = waitlistDraft({ name: "Ada", email: "ada@example.com", agency: "North", website: "javascript:alert(1)" });
  assert.equal(site.ok, false);
  const range = waitlistDraft({ name: "Ada", email: "ada@example.com", agency: "North", clients: "thousands" });
  assert.equal(range.ok, false);

  const draft = waitlistDraft({
    name: " Ada ",
    email: "Ada@Example.com",
    agency: " North ",
    website: "north.example",
    clients: CLIENT_COUNT_OPTIONS[1],
    spend: MONTHLY_SPEND_OPTIONS[0],
    message: " Hello ",
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  assert.equal(draft.value.email, "ada@example.com");
  assert.equal(draft.value.agencyName, "North");
  assert.equal(draft.value.message, "Hello");

  const { saved, store } = storeOf();
  const limits = new Map<string, { n: number; at: number }>();
  const hidden = await acceptAgencyWaitlist({
    fields: { name: "Ada", email: "ada@example.com", agency: "North", company_fax: "bot" },
    env: { PUBLIC_HOMEPAGE: "on" },
    store,
    now: 1_000,
    ip: "203.0.113.9",
    limits,
  });
  assert.deepEqual(hidden, { status: 200 });
  assert.equal(saved.length, 0);

  const stored = await acceptAgencyWaitlist({
    fields: draft.value,
    env: { PUBLIC_HOMEPAGE: "on" },
    store,
    now: 1_000,
    ip: "203.0.113.10",
    limits,
  });
  assert.deepEqual(stored, { status: 200, id: "wait-1" });
  assert.deepEqual(saved, [draft.value]);

  const off = await acceptAgencyWaitlist({
    fields: draft.value,
    env: {},
    store,
    limits,
  });
  assert.equal(off.status, 404);
  assert.equal(saved.length, 1);
});

test("waitlist rate limit stops before another row is written", async () => {
  const { saved, store } = storeOf();
  const limits = new Map<string, { n: number; at: number }>();
  const fields = { name: "Ada", email: "ada@example.com", agency: "North" };
  for (let i = 0; i < WAITLIST_LIMIT; i += 1) {
    const result = await acceptAgencyWaitlist({
      fields,
      env: { PUBLIC_HOMEPAGE: "on" },
      store,
      now: 5_000,
      ip: "203.0.113.20",
      limits,
    });
    assert.equal(result.status, 200, String(i));
  }
  assert.equal(saved.length, WAITLIST_LIMIT);
  const blocked = await acceptAgencyWaitlist({
    fields,
    env: { PUBLIC_HOMEPAGE: "on" },
    store,
    now: 5_000,
    ip: "198.51.100.8",
    limits,
  });
  assert.equal(blocked.status, 429);
  assert.equal(saved.length, WAITLIST_LIMIT);

  const form = await acceptAgencyWaitlist({
    fields,
    form: true,
    env: { PUBLIC_HOMEPAGE: "on" },
    store,
    now: 5_000,
    ip: "203.0.113.20",
    limits,
  });
  assert.deepEqual(form, { status: 303, location: "/?waitlist=limited#agency-waitlist" });
});

test("the waitlist route rejects bad input and does not require a new mail secret", async () => {
  resetWaitlistLimits();
  await withHomepage(undefined, async () => {
    const off = await POST(post({ name: "Ada", email: "ada@example.com", agency: "North" }, "203.0.113.30"));
    assert.equal(off.status, 404);
  });

  await withHomepage("on", async () => {
    const refused = await POST(
      post({ name: "Ada", email: "ada@example.com", agency: "North" }, "203.0.113.31", { origin: "https://evil.example" }),
    );
    assert.equal(refused.status, 400);

    const invalid = await POST(post({ name: "Ada", email: "not-an-email", agency: "North" }, "203.0.113.32"));
    assert.equal(invalid.status, 400);
    const invalidBody = (await invalid.json()) as { error: string };
    assert.match(invalidBody.error, /email you use for work/);

    const honeypot = await POST(post({ name: "Ada", email: "ada@example.com", agency: "North", company_fax: "filled" }, "203.0.113.33"));
    assert.equal(honeypot.status, 200);
    const honeypotBody = (await honeypot.json()) as { ok: boolean; id?: string };
    assert.equal(honeypotBody.ok, true);
    assert.equal(honeypotBody.id, undefined);

    const data = new FormData();
    data.set("name", "");
    data.set("email", "ada@example.com");
    data.set("agency", "North");
    const form = await POST(
      new Request(`${ORIGIN}/api/homepage/waitlist`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.34", host: "voiceops.test" },
        body: data,
      }),
    );
    assert.equal(form.status, 303);
    assert.match(form.headers.get("location") || "", /waitlist=invalid#agency-waitlist/);

    resetWaitlistLimits();
    for (let i = 0; i < WAITLIST_LIMIT; i += 1) {
      const attempt = await POST(post({ name: "", email: "ada@example.com", agency: "North" }, "203.0.113.40"));
      assert.equal(attempt.status, 400);
    }
    const limited = await POST(post({ name: "Ada", email: "ada@example.com", agency: "North" }, "203.0.113.40"));
    assert.equal(limited.status, 429);
  });

  for (const file of ["lib/agency-waitlist.ts", "app/api/homepage/waitlist/route.ts", "components/homepage-waitlist-form.tsx"]) {
    const source = sourceOf(file);
    assert.equal(source.includes("resend"), false, file);
    assert.equal(source.includes("nodemailer"), false, file);
    assert.equal(source.includes("mailto:"), false, file);
    assert.equal(/process\.env\.[A-Z0-9_]*KEY/.test(source), false, file);
  }
});

test("the waitlist route is public with the homepage and closed to demo viewers", async () => {
  assert.equal(clientViewerAllowed("/api/homepage/waitlist"), true);
  const off = await proxy(request("/api/homepage/waitlist"), {});
  assert.equal(off.status, 401);
  const on = await proxy(request("/api/homepage/waitlist"), { PUBLIC_HOMEPAGE: "on" });
  assert.equal(on.headers.get("x-middleware-next"), "1");
  const token = await signToken({ kind: "session", sid: "sid", role: "demo_viewer", exp: Math.floor(Date.now() / 1000) + 3600 });
  const demo = await proxy(request("/api/homepage/waitlist", token), { PUBLIC_HOMEPAGE: "on" });
  assert.equal(demo.status, 403);
});

test("demo reseed does not name the agency waitlist table", () => {
  for (const file of ["lib/demo/seed-apply.ts", "lib/demo/seed-rows.ts", "lib/demo/modules.ts", "lib/demo/dataset.ts"]) {
    const source = sourceOf(file);
    assert.equal(source.includes("AgencyWaitlist"), false, file);
    assert.equal(source.includes("agencyWaitlist"), false, file);
  }
  const schema = sourceOf("prisma/schema.prisma");
  const start = schema.indexOf("model AgencyWaitlist");
  const end = schema.indexOf("}", start);
  const block = schema.slice(start, end);
  assert.equal(block.includes("workspaceId"), false);
  assert.match(block, /agencyName/);
});

test("the homepage links to the agency waitlist and shows a success state", () => {
  const model = homepageModel({ PUBLIC_HOMEPAGE: "on" });
  const html = renderToStaticMarkup(createElement(PublicHomepage, { model }));
  assert.match(html, /Bring jAI to your agency/);
  assert.match(html, /Agency subscriptions are coming/);
  assert.match(html, /action="\/api\/homepage\/waitlist"/);
  assert.match(html, /name="company_fax"/);
  assert.match(html, /name="agency"/);
  assert.match(html, /More than 50/);
  assert.match(html, /Under 25,000/);
  assert.equal(html.includes("$"), false);
  const nav = (html.match(/href="#agency-waitlist"/g) || []).length;
  assert.ok(nav >= 4, String(nav));
  assert.match(html, /data-cta="agency-waitlist-hero"/);
  const saved = renderToStaticMarkup(createElement(PublicHomepage, { model, waitlist: "saved" }));
  assert.equal(saved.includes('action="/api/homepage/waitlist"'), false);
  assert.match(saved, /on the list/);
  assert.match(saved, /Nothing was sent/);
  const invalid = renderToStaticMarkup(createElement(PublicHomepage, { model, waitlist: "invalid" }));
  assert.match(invalid, /Enter your name, a work email, and your agency name/);
  assert.match(invalid, /action="\/api\/homepage\/waitlist"/);
  const prose = homepageProse(model);
  assert.equal(prose.includes("$"), false);
  assert.equal(prose.includes("%"), false);
  assert.match(prose, /Bring jAI to your agency/);
});

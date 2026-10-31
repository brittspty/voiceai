import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PublicHomepage } from "../components/public-homepage";
import { acceptHomepageContact, saveHomepageContact } from "./homepage-contact";
import { feedShouldAdvance } from "./homepage-feed";
import { HOMEPAGE_SECTION_ORDER, HOMEPAGE_SIGNOFF_TODO, homepageMetadata, homepageModel, homepageProse } from "./homepage-content";
import { homepageStyle } from "./homepage-style";
import { canonicalOrigin, isSpecificityPublicHost } from "./hosts";
import { proxy } from "../proxy";
import { loginNextField, postLoginPath, publicHomepageEnabled, demoWorkspaceEnabled } from "./public-routing";
import { sameOriginPath } from "./same-origin-path";
import { SESSION_COOKIE, signToken } from "./session-token";

const ORIGIN = "http://voiceops.test";

function sourceOf(file: string) {
  return readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

function request(pathname: string, token?: string, headers?: Record<string, string>) {
  const all = new Headers(headers);
  if (token !== undefined) all.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new NextRequest(`${ORIGIN}${pathname}`, { headers: all });
}

async function session(role: string) {
  return signToken({ kind: "session", sid: "sid", role, exp: Math.floor(Date.now() / 1000) + 3600 });
}

function page(model: ReturnType<typeof homepageModel>, notice?: "saved" | "invalid" | null) {
  return renderToStaticMarkup(createElement(PublicHomepage, { model, notice }));
}

test("public homepage and demo switches default off", () => {
  assert.equal(publicHomepageEnabled({}), false);
  assert.equal(publicHomepageEnabled({ PUBLIC_HOMEPAGE: "off" }), false);
  assert.equal(publicHomepageEnabled({ PUBLIC_HOMEPAGE: "false" }), false);
  assert.equal(publicHomepageEnabled({ PUBLIC_HOMEPAGE: "0" }), false);
  assert.equal(demoWorkspaceEnabled({}), false);
  for (const value of ["on", "true", "1", "yes", " ON "]) {
    assert.equal(publicHomepageEnabled({ PUBLIC_HOMEPAGE: value }), true, value);
    assert.equal(demoWorkspaceEnabled({ DEMO_WORKSPACE: value }), true, value);
  }
});

test("switch off keeps today's routes", async () => {
  const env = {};
  const owner = await session("owner");
  const home = await proxy(request("/", owner), env);
  assert.equal(home.headers.get("location"), null);
  assert.match(home.headers.get("x-middleware-rewrite") || "", /\/app$/);
  assert.equal(home.headers.get("x-middleware-request-x-voiceops-path"), "/");

  const login = await proxy(request("/login", owner), env);
  assert.equal(new URL(login.headers.get("location") || "", ORIGIN).pathname, "/");

  const guest = await proxy(request("/calls/contacts"), env);
  const guestUrl = new URL(guest.headers.get("location") || "", ORIGIN);
  assert.equal(guestUrl.pathname, "/login");
  assert.equal(guestUrl.searchParams.get("next"), "/calls/contacts");

  const app = await proxy(request("/app"), env);
  assert.equal(new URL(app.headers.get("location") || "", ORIGIN).pathname, "/login");
  const appIn = await proxy(request("/app?client=a", owner), env);
  const back = new URL(appIn.headers.get("location") || "", ORIGIN);
  assert.equal(back.pathname, "/");
  assert.equal(back.searchParams.get("client"), "a");
});

test("switch on serves a public home and gates /app", async () => {
  const env = { PUBLIC_HOMEPAGE: "on" };
  const owner = await session("owner");
  const home = await proxy(request("/", owner), env);
  assert.equal(home.headers.get("location"), null);
  assert.equal(home.headers.get("x-middleware-rewrite"), null);
  assert.equal(home.headers.get("x-middleware-next"), "1");

  const guestHome = await proxy(request("/"), env);
  assert.equal(guestHome.headers.get("location"), null);

  const app = await proxy(request("/app"), env);
  const locked = new URL(app.headers.get("location") || "", ORIGIN);
  assert.equal(locked.pathname, "/login");
  assert.equal(locked.searchParams.get("next"), "/app");

  const open = await proxy(request("/app", owner), env);
  assert.equal(open.headers.get("location"), null);
  assert.equal(open.headers.get("x-middleware-next"), "1");

  const deep = await proxy(request("/marketing/leads/abc", owner), env);
  assert.equal(deep.headers.get("location"), null);
  const guestDeep = await proxy(request("/marketing/leads/abc"), env);
  assert.equal(new URL(guestDeep.headers.get("location") || "", ORIGIN).searchParams.get("next"), "/marketing/leads/abc");
});

test("webhooks, api routes, oauth, and the session cookie stay unchanged", async () => {
  assert.equal(SESSION_COOKIE, "voiceops_session");
  for (const flag of [{}, { PUBLIC_HOMEPAGE: "on" }]) {
    for (const path of ["/api/webhooks/ghl", "/api/webhooks/twilio", "/api/webhooks/elevenlabs", "/api/webhooks/landing"]) {
      const response = await proxy(
        request(path, undefined, { "x-voiceops-signature": "sig", "x-voiceops-workspace": "org" }),
        flag,
      );
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(response.headers.get("x-middleware-request-x-voiceops-signature"), "sig", path);
      assert.equal(response.headers.get("x-middleware-request-x-voiceops-workspace"), "org", path);
      assert.equal(response.headers.get("x-middleware-request-x-voiceops-path"), path);
    }
    const health = await proxy(request("/api/health"), flag);
    assert.equal(health.headers.get("location"), null);
    const oauth = await proxy(request("/api/marketing/conversions/connect/google/callback"), flag);
    assert.equal(oauth.status, 401);
    assert.equal(oauth.headers.get("location"), null);
    assert.equal((await oauth.json()).error, "Sign in required");
    const calls = await proxy(request("/api/calls/abc"), flag);
    assert.equal(calls.status, 401);
  }
});

test("sign-in routes by role only when the public homepage is on", async () => {
  const roles = ["super_admin", "account_manager", "client_viewer", "owner", "admin", "viewer"] as const;
  for (const role of roles) {
    assert.equal(postLoginPath(role, {}), role === "client_viewer" ? "/marketing/client" : "/");
    assert.deepEqual(loginNextField(role, {}), {});
    const off = await proxy(request("/login", await session(role)), {});
    assert.equal(new URL(off.headers.get("location") || "", ORIGIN).pathname, postLoginPath(role, {}));
  }
  const on = { PUBLIC_HOMEPAGE: "on" };
  assert.equal(postLoginPath("super_admin", on), "/marketing");
  assert.equal(postLoginPath("account_manager", on), "/marketing");
  assert.equal(postLoginPath("client_viewer", on), "/marketing/client");
  assert.equal(postLoginPath("owner", on), "/app");
  assert.equal(postLoginPath("admin", on), "/app");
  assert.equal(postLoginPath("viewer", on), "/app");
  assert.equal(loginNextField("account_manager", on).next, "/marketing");
  assert.equal(loginNextField("client_viewer", on).next, "/marketing/client");
  for (const role of roles) {
    const response = await proxy(request("/login", await session(role)), on);
    assert.equal(new URL(response.headers.get("location") || "", ORIGIN).pathname, postLoginPath(role, on), role);
  }
  const viewer = await proxy(request("/marketing", await session("client_viewer")), on);
  assert.equal(new URL(viewer.headers.get("location") || "", ORIGIN).pathname, "/marketing/client");
});

test("login destinations stay on this site", () => {
  assert.equal(sameOriginPath("/marketing", "/app"), "/marketing");
  assert.equal(sameOriginPath("https://evil.example/app", "/app"), "/app");
  assert.equal(sameOriginPath("//evil.example", "/app"), "/app");
  assert.equal(sameOriginPath(undefined, "/"), "/");
});

test("homepage contact is stored and nothing is sent", async () => {
  const saved: unknown[] = [];
  const store = {
    create: async (data: { name: string; email: string; company: string; message: string }) => {
      saved.push(data);
      return { id: "row-1" };
    },
  };
  const off = await acceptHomepageContact({
    fields: { name: "Ada", email: "Ada@Example.com", message: "Hello" },
    env: {},
    store,
  });
  assert.equal(off.status, 404);
  assert.equal(saved.length, 0);

  const refused = await acceptHomepageContact({
    fields: { name: "Ada", email: "ada@example.com", message: "Hello" },
    env: { PUBLIC_HOMEPAGE: "on" },
    store,
    originAllowed: false,
  });
  assert.equal(refused.status, 400);
  assert.equal(saved.length, 0);

  const missing = await saveHomepageContact({ name: "Ada", email: "not-an-email", message: "Hello" }, store);
  assert.equal(missing.ok, false);
  assert.equal(saved.length, 0);

  const stored = await saveHomepageContact({ name: " Ada ", email: "Ada@Example.com", company: "North", message: " Hello " }, store);
  assert.deepEqual(stored, { ok: true, id: "row-1" });
  assert.deepEqual(saved, [{ name: "Ada", email: "ada@example.com", company: "North", message: "Hello" }]);

  const form = await acceptHomepageContact({
    fields: { name: "Ada", email: "ada@example.com", message: "Hello" },
    form: true,
    env: { PUBLIC_HOMEPAGE: "on" },
    store,
  });
  assert.deepEqual(form, { status: 303, location: "/?contact=saved" });

  for (const file of ["lib/homepage-contact.ts", "app/api/homepage/contact/route.ts", "components/public-homepage.tsx"]) {
    const source = sourceOf(file);
    assert.equal(source.includes("sendInviteEmail"), false, file);
    assert.equal(source.includes("resend"), false, file);
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(source.includes("nodemailer"), false, file);
    assert.equal(source.includes("mailto:"), false, file);
  }
});

test("try the demo is hidden unless DEMO_WORKSPACE is on", () => {
  const off = page(homepageModel({ PUBLIC_HOMEPAGE: "on" }));
  assert.equal(off.includes("Try the demo"), false);
  assert.equal(off.includes('href="/demo"'), false);
  assert.equal((off.match(/href="#contact"/g) || []).length, 2);
  assert.equal((off.match(/>Client login</g) || []).length, 2);
  assert.equal((off.match(/>Team login</g) || []).length, 2);
  assert.equal((off.match(/href="\/login"/g) || []).length, 4);

  const on = page(homepageModel({ PUBLIC_HOMEPAGE: "on", DEMO_WORKSPACE: "on" }));
  assert.equal(on.split("Try the demo").length - 1, 2);
  assert.equal(on.split('href="/demo"').length - 1, 2);
  assert.equal(homepageModel({}).showTryDemo, false);
  assert.equal(homepageModel({ DEMO_WORKSPACE: "on" }).showTryDemo, true);
});

test("direction B is the default and A is a layout switch", () => {
  assert.equal(homepageModel({}).direction, "B");
  assert.equal(homepageModel({ HOMEPAGE_DIRECTION: "A" }).direction, "A");
  assert.equal(homepageModel({ HOMEPAGE_DIRECTION: "b" }).direction, "B");
  const a = homepageStyle("A");
  const b = homepageStyle("B");
  assert.notEqual(a.hero, b.hero);
  assert.notEqual(a.band, b.band);
  const htmlA = page(homepageModel({ HOMEPAGE_DIRECTION: "A" }));
  const htmlB = page(homepageModel({ HOMEPAGE_DIRECTION: "B" }));
  assert.notEqual(htmlA, htmlB);
  assert.match(htmlB, /lg:grid-cols-2/);
  assert.match(htmlA, /flex flex-col gap-8/);
  assert.match(htmlA, /data-direction="A"/);
  assert.match(htmlB, /data-direction="B"/);
});

test("homepage sections stay in order with placeholder copy and no invented stats", () => {
  const model = homepageModel({ PUBLIC_HOMEPAGE: "on" });
  assert.equal(model.steps.length, 4);
  assert.equal(model.bands.length, 2);
  const prose = homepageProse(model);
  assert.equal(/\d/.test(prose), false, prose);
  for (const word of ["privacy", "pricing", "price", "business day", "$", "%"]) {
    assert.equal(prose.toLowerCase().includes(word), false, word);
  }
  assert.match(HOMEPAGE_SIGNOFF_TODO, /Privacy wording, pricing, and reply-time promises/);
  assert.match(prose, /PLACEHOLDER/);
  assert.equal(model.brandColor, "#FF5800");
  assert.match(model.fonts.sans, /Poppins|font-brand/);
  assert.match(model.fonts.mono, /IBM Plex Mono/);
  const html = page(model, "saved");
  let cursor = -1;
  for (const id of HOMEPAGE_SECTION_ORDER) {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > cursor, id);
    cursor = at;
  }
  assert.match(html, /action="\/api\/homepage\/contact"/);
  assert.match(html, /Nothing was sent/);
  assert.equal(html.includes("mailto:"), false);
  const signedIn = page(homepageModel({ PUBLIC_HOMEPAGE: "on" }, { signedIn: true, role: "super_admin" }));
  assert.match(signedIn, /Go to app/);
  assert.match(signedIn, /href="\/marketing"/);
  const meta = homepageMetadata("https://jarvis.specificityinc.com");
  assert.equal(meta.title.absolute, "Jarvis by Specificity");
  assert.match(meta.description, /PLACEHOLDER/);
  assert.equal(meta.openGraph.title, "Jarvis by Specificity");
  assert.match(meta.openGraph.images[0].url, /specificity-logo-full\.png$/);
});

test("the rotating feed pauses for hover, focus, and reduced motion", () => {
  assert.equal(feedShouldAdvance({ hovering: false, focused: false, reducedMotion: false }), true);
  assert.equal(feedShouldAdvance({ hovering: true, focused: false, reducedMotion: false }), false);
  assert.equal(feedShouldAdvance({ hovering: false, focused: true, reducedMotion: false }), false);
  assert.equal(feedShouldAdvance({ hovering: false, focused: false, reducedMotion: true }), false);
  const source = sourceOf("components/homepage-feed.tsx");
  assert.match(source, /onMouseEnter/);
  assert.match(source, /onFocusCapture/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /feedShouldAdvance/);
});

test("voiceai and jarvis are both public hosts", () => {
  assert.equal(isSpecificityPublicHost("voiceai.specificityinc.com"), true);
  assert.equal(isSpecificityPublicHost("jarvis.specificityinc.com"), true);
  assert.equal(canonicalOrigin("jarvis.specificityinc.com", { APP_URL: "https://voiceai.specificityinc.com" }), "https://jarvis.specificityinc.com");
  assert.equal(canonicalOrigin("voiceai.specificityinc.com:443", {}), "https://voiceai.specificityinc.com");
  assert.equal(
    canonicalOrigin("jarvis.specificityinc.com, voiceai.specificityinc.com", { APP_URL: "https://voiceai.specificityinc.com" }),
    "https://jarvis.specificityinc.com",
  );
  assert.equal(canonicalOrigin("evil.example", { APP_URL: "https://voiceai.specificityinc.com" }), "https://voiceai.specificityinc.com");
  assert.equal(isSpecificityPublicHost("voiceai.specificityinc.com.evil.example"), false);
});

test("demo path is public only when DEMO_WORKSPACE is on", async () => {
  const hidden = await proxy(request("/demo"), {});
  assert.equal(new URL(hidden.headers.get("location") || "", ORIGIN).pathname, "/login");
  const open = await proxy(request("/demo"), { DEMO_WORKSPACE: "on" });
  assert.equal(open.headers.get("location"), null);
  assert.equal(open.headers.get("x-middleware-next"), "1");
});

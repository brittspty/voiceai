import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostHogAnalytics } from "../../components/posthog-analytics";
import { sensitiveCaptureClass } from "./capture";
import {
  analyticsConsentGranted,
  consentLevelFromDiverRecord,
  readAnalyticsConsent,
  readDiverConsentRecord,
  registerAnalyticsConsent,
  resetAnalyticsConsentReader,
} from "./consent";
import {
  POSTHOG_API_HOST,
  bootPosthog,
  identifyPayload,
  isLogoutAction,
  posthogBrowserKey,
  posthogClientProps,
  posthogEnabled,
  posthogExcluded,
  posthogInitConfig,
  sanitizeAnalyticsEvent,
  sanitizeAnalyticsUrl,
  sessionRecordingOptions,
  shouldLoadPosthog,
  type PosthogSdk,
} from "./posthog";

const ROOT = path.resolve(import.meta.dirname, "../..");
const KEY = "test-project-key";
const on = { POSTHOG_ENABLED: "on", NEXT_PUBLIC_POSTHOG_KEY: KEY, POSTHOG_PROJECT_API_KEY: KEY };

function sdk() {
  const calls: { name: string; args: unknown[] }[] = [];
  let initConfig: ReturnType<typeof posthogInitConfig> | null = null;
  const client: PosthogSdk = {
    init(key, config) {
      calls.push({ name: "init", args: [key] });
      initConfig = config;
    },
    identify(id, properties) {
      calls.push({ name: "identify", args: [id, properties] });
    },
    reset(resetDeviceId) {
      calls.push({ name: "reset", args: [resetDeviceId] });
    },
    stopSessionRecording() {
      calls.push({ name: "stop", args: [] });
    },
    startSessionRecording() {
      calls.push({ name: "start", args: [] });
    },
  };
  return {
    client,
    calls,
    config: () => initConfig,
  };
}

test.afterEach(() => {
  resetAnalyticsConsentReader();
});

test("the switch defaults off and a missing key never loads the SDK", async () => {
  assert.equal(posthogEnabled({}), false);
  assert.equal(posthogEnabled({ POSTHOG_ENABLED: "off" }), false);
  assert.equal(posthogEnabled({ POSTHOG_ENABLED: "on" }), true);
  assert.equal(posthogBrowserKey({ POSTHOG_PROJECT_API_KEY: KEY }), KEY);
  assert.equal(posthogBrowserKey({ NEXT_PUBLIC_POSTHOG_KEY: "browser-key", POSTHOG_PROJECT_API_KEY: KEY }), "browser-key");

  for (const env of [{}, { POSTHOG_ENABLED: "off", NEXT_PUBLIC_POSTHOG_KEY: KEY }, { POSTHOG_ENABLED: "on" }]) {
    let loaded = 0;
    let fetched = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      fetched += 1;
      throw new Error("network");
    };
    try {
      const session = bootPosthog(
        { env, pathname: "/marketing", role: "admin", userId: "user_1", consent: "high" },
        {
          loadSdk: async () => {
            loaded += 1;
            throw new Error("sdk");
          },
        },
      );
      await session.ready;
      assert.equal(session.loaded, false);
      assert.equal(loaded, 0);
      assert.equal(fetched, 0);
      assert.equal(posthogClientProps({ env, pathname: "/marketing", role: "admin", userId: "user_1" }), null);
    } finally {
      globalThis.fetch = original;
    }
  }
});

test("auth pages, magic links, and token URLs are excluded", () => {
  const blocked = [
    "/login",
    "/login/",
    "/demo/login",
    "/forgot-password",
    "/reset-password",
    "/request-access",
    "/api/auth/magic-link",
    "/api/auth/magic-link/redeem",
    "/invite/one-time",
    "/share/link-secret",
    "/api/share/link-secret",
    "/plan/link-secret",
    "/demo/enter",
  ];
  for (const pathname of blocked) {
    const decision = shouldLoadPosthog({ env: on, pathname, role: "admin", userId: "user_1", consent: "high" });
    assert.equal(decision.load, false, pathname);
    assert.equal(decision.reason, "excluded", pathname);
    assert.equal(posthogExcluded(pathname), true, pathname);
  }
  const queryBlocked = [
    { pathname: "/marketing", search: "?token=abc" },
    { pathname: "/marketing", search: "?access_token=abc" },
    { pathname: "/reset-password", search: "?token=abc" },
    { pathname: "/marketing", search: "?code=oauth" },
    { pathname: "/marketing", hash: "#token=abc" },
    { pathname: "/api/auth/magic-link/redeem", search: "?token=abc" },
  ];
  for (const input of queryBlocked) {
    const decision = shouldLoadPosthog({ env: on, role: "admin", userId: "user_1", consent: "high", ...input });
    assert.equal(decision.load, false, JSON.stringify(input));
    assert.equal(decision.reason, "excluded");
  }
  const staff = shouldLoadPosthog({ env: on, pathname: "/marketing", role: "admin", userId: "user_1" });
  assert.equal(staff.load, true);
  assert.equal(staff.surface, "staff");
});

test("identify sends the internal id and role only", async () => {
  const payload = identifyPayload({
    id: "user_1",
    role: "admin",
    email: "ada@example.com",
    name: "Ada",
    clientName: "Harbor",
  });
  assert.deepEqual(payload, { distinctId: "user_1", properties: { role: "admin" } });
  assert.equal(JSON.stringify(payload).includes("ada@"), false);
  assert.equal(JSON.stringify(payload).includes("Ada"), false);
  assert.equal(JSON.stringify(payload).includes("Harbor"), false);

  const fake = sdk();
  const session = bootPosthog(
    {
      env: on,
      pathname: "/marketing",
      role: "account_manager",
      userId: "user_1",
      email: "ada@example.com",
      name: "Ada",
      clientName: "Harbor",
    },
    { loadSdk: async () => fake.client },
  );
  await session.ready;
  assert.deepEqual(fake.calls.map((call) => call.name), ["init", "identify"]);
  assert.deepEqual(fake.calls[1]?.args, ["user_1", { role: "account_manager" }]);
  assert.equal(JSON.stringify(fake.calls).includes("ada@"), false);
  assert.equal(fake.calls[0]?.args[0], KEY);
  assert.equal(fake.config()?.api_host, POSTHOG_API_HOST);

  session.reset();
  assert.equal(fake.calls.at(-1)?.name, "reset");
  assert.equal(fake.calls.at(-1)?.args[0], true);
  assert.equal(isLogoutAction("/api/auth/logout"), true);
  assert.equal(isLogoutAction("https://jai.example/api/auth/logout?next=/login"), true);
  assert.equal(isLogoutAction("/marketing"), false);
});

test("session replay masks inputs and text and blocks media and sensitive containers", () => {
  const recording = sessionRecordingOptions();
  assert.equal(recording.maskAllInputs, true);
  assert.equal(recording.maskTextSelector, "*");
  assert.match(recording.blockSelector, /\bimg\b/);
  assert.match(recording.blockSelector, /\bcanvas\b/);
  assert.match(recording.blockSelector, /\bvideo\b/);
  assert.match(recording.blockSelector, /\bsvg\b/);
  assert.match(recording.blockSelector, /ph-no-capture/);
  assert.match(recording.blockSelector, /data-ph-no-capture/);
  assert.equal(recording.recordBody, false);
  assert.equal(recording.recordHeaders, false);
  assert.equal(recording.captureCanvas.recordCanvas, false);
  assert.equal(sensitiveCaptureClass("px-2"), "px-2 ph-no-capture");

  const config = posthogInitConfig();
  assert.equal(config.api_host, "https://us.i.posthog.com");
  assert.equal(config.mask_all_text, true);
  assert.equal(config.mask_all_element_attributes, true);
  assert.equal(config.autocapture.capture_copied_text, false);
  assert.deepEqual(config.autocapture.capture_value_css_selector_allowlist, []);

  assert.equal(
    sanitizeAnalyticsEvent({
      event: "$pageview",
      properties: { $current_url: "https://jai.example/marketing?token=secret" },
    }),
    null,
  );
  const cleaned = sanitizeAnalyticsEvent({
    event: "$autocapture",
    properties: {
      $current_url: "https://jai.example/marketing/client?email=ada@example.com&client=harbor",
      $referrer: "https://jai.example/invite/secret?phone=+1%20555%20111%202222",
      $el_text: "Harbor spend $10 ROAS 4.2",
      $input_value: "ada@example.com",
      email: "ada@example.com",
      clientName: "Harbor",
      spend: 10,
      budget: 20,
      cpc: 1.2,
      roas: 4,
      audience: "retargeting",
      phone: "+15551112222",
      role: "admin",
      $pathname: "/marketing",
    },
    $set: { email: "ada@example.com", name: "Ada", role: "admin", clientName: "Harbor" },
  });
  assert.ok(cleaned);
  assert.equal(cleaned?.properties?.$current_url, "https://jai.example/marketing/client");
  assert.equal(cleaned?.properties?.$referrer, "https://jai.example/invite/_");
  assert.equal(cleaned?.properties?.$el_text, undefined);
  assert.equal(cleaned?.properties?.$input_value, undefined);
  assert.equal(cleaned?.properties?.email, undefined);
  assert.equal(cleaned?.properties?.spend, undefined);
  assert.equal(cleaned?.properties?.clientName, undefined);
  assert.equal(cleaned?.properties?.role, "admin");
  assert.deepEqual(cleaned?.$set, { role: "admin" });
  const serialized = JSON.stringify(cleaned);
  assert.equal(serialized.includes("ada@"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("Harbor"), false);
  assert.equal(serialized.includes("555"), false);
  assert.equal(sanitizeAnalyticsUrl("https://jai.example/calls/+19195551212?x=1"), "https://jai.example/calls/_");
  assert.equal(sanitizeAnalyticsEvent({ event: "$pageview", properties: { $current_url: "https://jai.example/share/secret" } }), null);
});

test("client-facing pages and embeds stay off without medium or high consent", async () => {
  assert.equal(readAnalyticsConsent(), "none");
  assert.equal(analyticsConsentGranted("none"), false);
  assert.equal(analyticsConsentGranted("reject"), false);
  assert.equal(analyticsConsentGranted("low"), false);
  assert.equal(analyticsConsentGranted("medium"), true);
  assert.equal(analyticsConsentGranted("high"), true);
  assert.equal(consentLevelFromDiverRecord({ level: "high", action: "grant", version: "draft" }), "high");
  assert.equal(consentLevelFromDiverRecord({ level: "medium", action: "withdraw", version: "draft" }), "none");
  const storage = new Map<string, string>();
  storage.set("diver_consent_harbor", JSON.stringify({ level: "medium", action: "grant", version: "draft" }));
  assert.equal(readDiverConsentRecord({ getItem: (key) => storage.get(key) ?? null }, "harbor"), "medium");
  assert.equal(readDiverConsentRecord({ getItem: () => null }, "harbor"), "none");

  const clientPage = "/marketing/client";
  const blocked = shouldLoadPosthog({ env: on, pathname: clientPage, role: "client_viewer", userId: "user_1" });
  assert.equal(blocked.load, false);
  assert.equal(blocked.reason, "consent");
  assert.equal(blocked.surface, "client");
  assert.equal(shouldLoadPosthog({ env: on, pathname: clientPage, role: "admin", userId: "user_1", consent: "low" }).load, false);
  assert.equal(shouldLoadPosthog({ env: on, pathname: clientPage, role: "admin", userId: "user_1", consent: "reject" }).load, false);
  assert.equal(shouldLoadPosthog({ env: on, pathname: "/", embed: true }).load, false);
  assert.equal(shouldLoadPosthog({ env: on, pathname: "/", embed: true }).reason, "consent");

  const medium = shouldLoadPosthog({ env: on, pathname: clientPage, role: "client_viewer", userId: "user_1", consent: "medium" });
  assert.equal(medium.load, true);
  assert.equal(medium.identify, true);
  const high = shouldLoadPosthog({ env: on, pathname: "/", embed: true, consent: "high" });
  assert.equal(high.load, true);
  assert.equal(high.surface, "embed");
  assert.equal(shouldLoadPosthog({ env: on, pathname: "/login", embed: true, consent: "high" }).load, false);

  const share = shouldLoadPosthog({ env: on, pathname: "/share/link-secret", consent: "high" });
  assert.equal(share.load, false);
  assert.equal(share.reason, "excluded");

  registerAnalyticsConsent(() => "high");
  assert.equal(shouldLoadPosthog({ env: on, pathname: clientPage, role: "client_viewer", userId: "user_1" }).load, true);
  resetAnalyticsConsentReader();
  assert.equal(shouldLoadPosthog({ env: on, pathname: clientPage, role: "client_viewer", userId: "user_1" }).load, false);

  let loaded = 0;
  const session = bootPosthog(
    { env: on, pathname: clientPage, role: "client_viewer", userId: "user_1" },
    {
      loadSdk: async () => {
        loaded += 1;
        throw new Error("sdk");
      },
    },
  );
  await session.ready;
  assert.equal(loaded, 0);
  assert.equal(posthogClientProps({ env: on, pathname: "/app", role: "admin", userId: "user_1" })?.apiHost, POSTHOG_API_HOST);
});

test("the browser mount renders no script and the key is not in the repo", () => {
  const html = renderToStaticMarkup(createElement(PostHogAnalytics, { apiKey: KEY, userId: "user_1", role: "admin" }));
  assert.equal(html, "");
  assert.equal(html.includes("script"), false);
  assert.equal(html.includes("posthog"), false);
  assert.equal(html.includes(KEY), false);

  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /^POSTHOG_ENABLED=off$/m);
  assert.match(example, /^POSTHOG_PROJECT_API_KEY=$/m);
  assert.match(example, /^NEXT_PUBLIC_POSTHOG_KEY=$/m);
  const files = [
    "lib/analytics/posthog.ts",
    "lib/analytics/consent.ts",
    "lib/analytics/posthog.test.ts",
    "components/posthog-analytics.tsx",
    ".env.example",
    "app/layout.tsx",
  ];
  const projectKeyPrefix = "ph" + "c_";
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes(projectKeyPrefix), false, file);
  }
  const component = readFileSync(path.join(ROOT, "components/posthog-analytics.tsx"), "utf8");
  assert.equal(component.includes('from "posthog-js"'), false);
  assert.match(component, /import\("posthog-js"\)/);
  assert.match(readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8"), /posthogClientProps/);
});

test("moving onto an excluded URL stops capture", async () => {
  const fake = sdk();
  const session = bootPosthog(
    { env: on, pathname: "/marketing", role: "admin", userId: "user_1" },
    { loadSdk: async () => fake.client },
  );
  await session.ready;
  session.noteLocation({ pathname: "/forgot-password" });
  assert.equal(fake.calls.at(-1)?.name, "stop");
  const beforeSend = fake.config()?.before_send;
  assert.equal(beforeSend?.({ event: "$pageview", properties: { role: "admin" } }), null);
  session.noteLocation({ pathname: "/marketing" });
  assert.equal(fake.calls.at(-1)?.name, "start");
});

import assert from "node:assert/strict";
import test from "node:test";
import { clientConfig, defaultKnowledge, parseBrandColor, parseLogoUrl, parseOffices, showDemoLogin } from "./client-config";

test("defaults to the Specificity workspace", () => {
  const cfg = clientConfig({});
  assert.equal(cfg.companyName, "Specificity Inc");
  assert.equal(cfg.agentName, "Avery");
  assert.equal(cfg.timezone, "America/New_York");
  assert.equal(cfg.brandColor, "#2563eb");
  assert.equal(cfg.mark, "V");
  assert.deepEqual(cfg.offices.map((office) => office.name), ["Main office", "Virtual"]);
  assert.equal(cfg.owner.email, "alex.rivera@specificityinc.example");
  assert.equal(cfg.showDemoLogin, true);
});

test("reads a client identity from the environment", () => {
  const cfg = clientConfig({
    SEED_ORG_NAME: "Northwind",
    SEED_AGENT_NAME: "Mina",
    SEED_TIMEZONE: "America/Chicago",
    SEED_BRAND_COLOR: "#112233",
    SEED_LOGO_URL: "https://cdn.example.com/mark.png",
    SEED_MARK: "N",
    SEED_OFFICES: "Austin|office|America/Chicago;Remote|virtual",
    SEED_OWNER_EMAIL: "Owner@Northwind.Example",
    SHOW_DEMO_LOGIN: "false",
    APP_URL: "http://127.0.0.1:43123",
  });
  assert.equal(cfg.companyName, "Northwind");
  assert.equal(cfg.agentName, "Mina");
  assert.equal(cfg.timezone, "America/Chicago");
  assert.equal(cfg.brandColor, "#112233");
  assert.equal(cfg.logoUrl, "https://cdn.example.com/mark.png");
  assert.equal(cfg.mark, "N");
  assert.deepEqual(cfg.offices, [
    { name: "Austin", type: "office", timezone: "America/Chicago" },
    { name: "Remote", type: "virtual", timezone: "America/Chicago" },
  ]);
  assert.equal(cfg.owner.email, "owner@northwind.example");
  assert.equal(cfg.showDemoLogin, false);
});

test("rejects colors and logos that are not safe to render", () => {
  assert.equal(parseBrandColor("red"), null);
  assert.equal(parseBrandColor("#2563eb"), "#2563eb");
  assert.equal(parseLogoUrl("javascript:alert(1)"), null);
  assert.equal(parseLogoUrl(""), "");
  assert.equal(parseLogoUrl("https://cdn.example.com/a.svg"), "https://cdn.example.com/a.svg");
});

test("hides the demo sign-in hint on a public host unless asked", () => {
  assert.equal(showDemoLogin({ APP_URL: "https://voiceai.specificityinc.com" }), false);
  assert.equal(showDemoLogin({ APP_URL: "https://voiceai.specificityinc.com", SHOW_DEMO_LOGIN: "true" }), true);
  assert.equal(showDemoLogin({ APP_URL: "http://127.0.0.1:43123" }), true);
});

test("the default knowledge script uses the configured company and agent", () => {
  const body = defaultKnowledge({
    companyName: "Specificity Inc",
    agentName: "Avery",
    timezone: "America/New_York",
    offices: [{ name: "Main office", timezone: "America/New_York" }],
  });
  assert.match(body, /Specificity Inc/);
  assert.match(body, /Avery/);
  assert.match(body, /Main office/);
  assert.equal(body.includes("Capital Financial"), false);
  assert.equal(parseOffices("  ", "Not/AZone").length, 2);
});

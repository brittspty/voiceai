import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoEntry } from "../../components/demo-entry";
import { DemoFrame } from "../../components/demo-frame";
import { TryDemoButton } from "../../components/try-demo-button";
import { sendInviteEmail } from "../mail";
import { getPorts } from "../adapters";
import { dataChipLabel } from "./chip";
import { buildDemoDataset, DEMO_FACTS } from "./dataset";
import { demoTourEnabled, demoWorkspaceEnabled } from "./flags";
import { DEMO_WORKSPACE_ID, demoViewerGate, workspacesVisibleTo } from "./isolation";
import { DemoOutboundBlocked, OUTBOUND_CHANNELS, assertOutboundOpen, channelForUrl, integrationsModeForWorkspace, outboundPlan, runAsWorkspace } from "./outbound";
import { compareHasFigures, presentDemo, presentationHasCost } from "./present";
import { reseedDue } from "./reseed";
import { TRY_DEMO_HREF, rewriteForDemoHost } from "./routes";
import { reseedDemo, type DemoWriter } from "./seed-apply";
import { runOptionalSeeds } from "./modules";
import { demoLoginAccepted, demoWriteStatus, secretMatches } from "./access";

test("demo switches default off and the secret disables the demo", () => {
  assert.equal(demoWorkspaceEnabled({}), false);
  assert.equal(demoWorkspaceEnabled({ DEMO_WORKSPACE: "on" }), false);
  assert.equal(demoWorkspaceEnabled({ DEMO_WORKSPACE: "on", DEMO_ACCESS_SECRET: "super-secret-value" }), true);
  assert.equal(demoTourEnabled({ DEMO_WORKSPACE: "on", DEMO_ACCESS_SECRET: "super-secret-value" }), false);
  assert.equal(demoTourEnabled({ DEMO_WORKSPACE: "on", DEMO_ACCESS_SECRET: "super-secret-value", DEMO_TOUR: "on" }), true);
  assert.equal(TRY_DEMO_HREF, "/demo");
});

test("demo and real workspaces cannot see each other", () => {
  const demo = workspacesVisibleTo("demo", ["org", "gulf", "demo"]);
  assert.deepEqual(demo, [{ workspaceId: "demo" }]);
  const real = workspacesVisibleTo("real", ["org", "gulf", "demo"]);
  assert.deepEqual(real, [{ workspaceId: "org" }, { workspaceId: "gulf" }]);
  assert.throws(() => workspacesVisibleTo("real", ["demo"]), /workspace/);
  assert.equal(demoViewerGate("/marketing"), "demo");
  assert.equal(demoViewerGate("/demo/audiences"), "allow");
  assert.equal(demoViewerGate("/contact"), "allow");
});

test("the demo tenant forces mock and blocks every outbound channel", async () => {
  const env = { INTEGRATIONS_MODE: "live" };
  assert.equal(integrationsModeForWorkspace("demo", env), "mock");
  assert.equal(integrationsModeForWorkspace("org", env), "live");
  assert.deepEqual(outboundPlan("demo", env).blocked, [...OUTBOUND_CHANNELS]);
  assert.deepEqual(outboundPlan("org", env).blocked, []);
  await runAsWorkspace("demo", async () => {
    for (const channel of OUTBOUND_CHANNELS) {
      assert.throws(() => assertOutboundOpen(channel), DemoOutboundBlocked);
    }
    assert.equal(getPorts(false).mocked, true);
    await assert.rejects(() => sendInviteEmail({ to: "a@example.com", name: "A", link: "https://example.com" }), /blocks outbound resend/);
  });
  assert.equal(channelForUrl("https://api.resend.com/emails"), "resend");
  assert.equal(channelForUrl("https://api.twilio.com/2010-04-01/Accounts/1.json"), "twilio");
  assert.equal(channelForUrl("https://services.leadconnectorhq.com/contacts/"), "ghl");
  assert.equal(channelForUrl("https://graph.facebook.com/v23.0/act_1/campaigns"), "meta");
  assert.equal(channelForUrl("https://googleads.googleapis.com/v26/customers/1/googleAds:search"), "google");
  assert.equal(channelForUrl("https://api.stackadapt.com/graphql"), "stackadapt");
  assert.equal(channelForUrl("https://business-api.tiktok.com/open_api/v1.3/campaign/get/"), "tiktok");
});

test("the seed is fictional, deterministic, and stays inside the demo workspace", async () => {
  const now = new Date("2026-10-30T15:00:00Z");
  const first = buildDemoDataset(now);
  const second = buildDemoDataset(now);
  assert.equal(first.workspaceId, DEMO_WORKSPACE_ID);
  assert.deepEqual(first, second);
  assert.ok(first.clients.length >= 3 && first.clients.length <= 4);
  for (const client of first.clients) {
    assert.match(client.name, /\(Demo\)$/);
    assert.match(client.email, /@example\.com$/);
    assert.match(client.phone, /^\+1555555/);
  }
  assert.ok(first.maids.every((row) => row.maid.startsWith("demo-maid-")));
  assert.equal(first.maids.length, DEMO_FACTS.fakeMaids);
  const platforms = new Set(first.campaigns.map((row) => row.platform));
  for (const platform of ["meta", "google_ads", "tiktok", "stackadapt", "ais2l"]) assert.ok(platforms.has(platform as "meta"));
  const days = new Set(first.metrics.map((row) => row.date));
  assert.equal(days.size, 90);
  const illustrative = first.campaigns.filter((row) => row.illustrative);
  assert.equal(illustrative.length, 1);
  assert.match(illustrative[0]?.name || "", /illustrative/i);
  assert.ok(first.decisions.some((row) => row.kind === "fatigue"));
  assert.ok(first.decisions.some((row) => row.kind === "segment_scale"));
  assert.ok(first.decisions.some((row) => row.kind === "segment_test"));
  assert.ok(first.decisions.some((row) => row.kind === "segment_cut"));
  assert.ok(first.feed.length > 0);
  assert.ok(first.reports.length > 0);
  assert.ok(first.leads.every((row) => row.secondsToLead > 0 && row.email.endsWith("@example.com")));

  const writes: Array<{ table: string; workspaceIds: string[] }> = [];
  const writer: DemoWriter = {
    async wipe(where) {
      assert.equal(where.workspaceId, "demo");
      writes.push({ table: "wipe", workspaceIds: [where.workspaceId] });
    },
    async put(table, rows) {
      writes.push({ table, workspaceIds: rows.map((row) => String(row.workspaceId)) });
    },
  };
  await reseedDemo(writer, first);
  assert.ok(writes.every((entry) => entry.workspaceIds.every((id) => id === "demo")));
  assert.ok(writes.some((entry) => entry.table === "dailyMetric"));

  const skipped = await runOptionalSeeds({}, first);
  assert.ok(skipped.every((row) => row.status === "skipped"));
  const created: Array<Record<string, unknown>> = [];
  const seeded = await runOptionalSeeds(
    {
      amFeedEvent: {
        async deleteMany(args: { where: { workspaceId: string } }) {
          assert.equal(args.where.workspaceId, "demo");
        },
        async create(args: { data: Record<string, unknown> }) {
          created.push(args.data);
        },
      },
    },
    first,
  );
  assert.equal(seeded.find((row) => row.id === "feed")?.status, "seeded");
  assert.ok(created.every((row) => row.workspaceId === "demo"));
});

test("client view drops cost and the demo frame is labeled", () => {
  const staff = presentDemo(buildDemoDataset(), "staff");
  const client = presentDemo(buildDemoDataset(), "client");
  assert.equal(presentationHasCost(staff), true);
  assert.equal(presentationHasCost(client), false);
  assert.equal(compareHasFigures(staff.compare), false);
  assert.equal(staff.chip, "DEMO DATA");
  assert.equal(dataChipLabel("product"), "EXAMPLE DATA");
  assert.equal(dataChipLabel("demo"), "DEMO DATA");
  const html = renderToStaticMarkup(
    <DemoFrame>
      <DemoEntry view="staff" tourEnabled />
    </DemoFrame>,
  );
  assert.match(html, /DEMO/);
  assert.match(html, /DEMO DATA/);
  assert.match(html, /demo-frame/);
  assert.match(html, /Start the tour/);
  assert.match(html, /Book a call/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, />Staff</);
  assert.match(html, />Client</);
  assert.match(renderToStaticMarkup(<TryDemoButton />), /Try the demo/);
  assert.match(renderToStaticMarkup(<TryDemoButton />), /href="\/demo"/);
});

test("demo host rewrite, login secret, and nightly reseed", () => {
  assert.equal(rewriteForDemoHost("demo.jarvis.specificityinc.com", "/"), "/demo");
  assert.equal(rewriteForDemoHost("voice.example.com", "/"), null);
  assert.equal(secretMatches("same", "same"), true);
  assert.equal(secretMatches("same", "other"), false);
  assert.equal(demoLoginAccepted("secret", { DEMO_ACCESS_SECRET: "secret" }), true);
  assert.equal(demoLoginAccepted("nope", { DEMO_ACCESS_SECRET: "secret" }), false);
  assert.equal(demoWriteStatus("demo_viewer"), 403);
  const morning = new Date("2026-10-30T12:00:00Z");
  const later = new Date("2026-10-31T06:00:00Z");
  assert.equal(reseedDue(null, morning), true);
  assert.equal(reseedDue(morning, morning), false);
  assert.equal(reseedDue(morning, later, "America/New_York"), true);
});

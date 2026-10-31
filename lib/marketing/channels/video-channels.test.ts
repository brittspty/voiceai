import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { listAudienceSources, listClientSources } from "../audience-data/present";
import { readResolution } from "../audience-data/resolution";
import { collectsCostKeys, stripForAudience } from "./cost-strip";
import { jarvisNav } from "./nav";
import { clientChannelPayload } from "./catalog";
import { assemblePortfolio, portfolioHasSpend, type PortfolioFacts } from "../../portfolio";
import {
  audienceMoreChannels,
  placeInDenseRow,
  presentedVideoChannels,
  resolutionMoreChannels,
} from "./video-channels";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ON = { JARVIS_UI_V2: "on" };

test("YouTube and CTV stay off until JARVIS_UI_V2 is on", () => {
  assert.deepEqual(presentedVideoChannels("staff", {}), []);
  assert.deepEqual(presentedVideoChannels("client", {}), []);
  assert.equal(audienceMoreChannels(0.49, 0.57, false), undefined);
  assert.equal(resolutionMoreChannels(49, false), undefined);
  const nav = jarvisNav({ audience: "staff", showAis2l: false, decisionCount: 0, showLive: false });
  assert.equal(nav.some((item) => item.href === "/c/all/youtube" || item.href === "/c/all/ctv"), false);
  const channels = jarvisNav({ audience: "staff", showAis2l: false, decisionCount: 0, showLive: false, showVideoChannels: true })
    .filter((item) => item.group === "Channels")
    .map((item) => item.label);
  assert.deepEqual(channels, ["Meta", "Google Ads", "YouTube", "StackAdapt", "CTV (StackAdapt)", "Google Business Profile"]);
});

test("YouTube uses the Google match rate and CTV runs through StackAdapt", () => {
  const staff = presentedVideoChannels("staff", ON);
  assert.deepEqual(staff.map((row) => row.id), ["youtube", "ctv"]);
  assert.deepEqual(staff[0]?.metrics.map((metric) => metric.label), ["Views", "View-through rate", "Completed views"]);
  assert.equal(staff[0]?.matchLabel, "YouTube (via Google)");
  assert.equal(staff[0]?.connection, "Through the Google Ads account");
  assert.equal(staff[0]?.spend, 760);
  assert.equal(staff[1]?.label, "CTV (StackAdapt)");
  assert.match(staff[1]?.status || "", /Connected \(read only\) through the StackAdapt account/);
  assert.equal(staff[1]?.placeholder, false);
  assert.equal("spend" in (staff[1] || {}), false);
  assert.deepEqual(staff[1]?.metrics.map((metric) => metric.label), ["Completion rate", "Households reached", "Frequency"]);
  const placed = placeInDenseRow(["Meta", "Google Ads", "StackAdapt", "Google Business Profile"], ["YouTube", "CTV (StackAdapt)"]);
  assert.deepEqual(placed.columns, ["Meta", "Google Ads", "StackAdapt", "Google Business Profile"]);
  assert.deepEqual(placed.more, ["YouTube", "CTV (StackAdapt)"]);
  assert.equal(placed.moreLabel, "More channels");
  assert.equal(placed.moreLink, "+2 more");
});

test("client YouTube and CTV payloads have no spend, cost, ROAS, CPL, or CPA", () => {
  const client = presentedVideoChannels("client", ON);
  assert.deepEqual(client.map((row) => row.id), ["youtube", "ctv"]);
  assert.equal(client[0]?.label, "YouTube video ads");
  assert.equal(client[1]?.label, "Connected TV ads");
  assert.equal(client[1]?.matchLabel, "CTV");
  assert.equal(JSON.stringify(client).includes("StackAdapt"), false);
  assert.deepEqual(collectsCostKeys(client), []);
  assert.equal(JSON.stringify(client).includes("spend"), false);
  const poisoned = stripForAudience({ ...clientChannelPayload(), moreChannels: presentedVideoChannels("staff", ON), spend: 9, cpl: 4, cpa: 8, roas: 2, cost: 1 }, "client");
  assert.deepEqual(collectsCostKeys(poisoned), []);
  assert.equal((poisoned.moreChannels as { id: string }[])[0]?.id, "youtube");
  assert.equal("spend" in ((poisoned.moreChannels as { spend?: number }[])[0] || {}), false);
  const list = listClientSources({ accountId: "org", env: ON });
  assert.deepEqual(collectsCostKeys(list), []);
  assert.equal(/vendor|vnd_|seg_/i.test(JSON.stringify(list)), false);
  for (const row of list.rows) {
    const google = row.match.find((item) => item.platform === "google_ads");
    assert.equal(row.moreChannels?.[0]?.label, "YouTube (via Google)");
    assert.equal(row.moreChannels?.[0]?.percent, google?.percent);
    assert.equal(row.moreChannels?.[1]?.label, "CTV");
    assert.equal(row.moreChannels?.[1]?.percent, row.match.find((item) => item.platform === "stackadapt")?.percent);
    assert.equal(row.moreChannels?.some((item) => item.label.includes("StackAdapt")), false);
    assert.equal(row.match.some((item) => item.full === "YouTube" || item.full === "CTV"), false);
  }
  const resolution = readResolution({ reader: "client", ownAccountId: "org", env: ON });
  assert.equal(resolution.ok, true);
  if (!resolution.ok) return;
  const google = resolution.body.platforms.find((row) => row.id === "google_ads");
  const youtube = resolution.body.platforms.find((row) => row.id === "youtube");
  const ctv = resolution.body.platforms.find((row) => row.id === "ctv");
  assert.deepEqual(resolution.body.platforms.map((row) => row.id), ["meta", "google_ads", "youtube", "stackadapt", "ctv"]);
  assert.equal(youtube?.label, "YouTube (via Google)");
  assert.equal(youtube?.percent, google?.percent);
  assert.equal(ctv?.label, "CTV");
  assert.equal(ctv?.percent, 27);
  assert.equal(resolution.body.platforms.filter((row) => row.percent < 30).length, 1);
  assert.equal(JSON.stringify(resolution.body).includes("Trade Desk"), false);
  assert.equal(JSON.stringify(resolution.body).includes("Other CTV"), false);
  assert.equal(JSON.stringify(resolution.body).includes("CTV (StackAdapt)"), false);
  assert.deepEqual(collectsCostKeys(resolution.body), []);
  assert.equal(/vendor|vnd_|seg_/i.test(JSON.stringify(resolution.body)), false);
});

test("staff resolution and the team dashboard keep YouTube and CTV off the main columns", () => {
  const off = readResolution({ reader: "staff", env: {} });
  assert.equal(off.ok, true);
  if (off.ok) assert.equal(off.body.moreChannels, undefined);
  const on = readResolution({ reader: "staff", env: ON });
  assert.equal(on.ok, true);
  if (!on.ok) return;
  const google = on.body.platforms.find((row) => row.id === "google_ads");
  assert.equal(on.body.platforms.find((row) => row.id === "youtube")?.label, "YouTube (via Google)");
  assert.equal(on.body.platforms.find((row) => row.id === "youtube")?.percent, google?.percent);
  assert.equal(on.body.platforms.find((row) => row.id === "ctv")?.label, "CTV (StackAdapt)");
  assert.equal(on.body.platforms.find((row) => row.id === "ctv")?.percent, 27);
  assert.equal(on.body.platforms.filter((row) => row.percent < 30).length, 1);
  assert.equal(on.body.platforms.length, 5);
  assert.equal(on.body.moreChannels, undefined);
  const sources = listAudienceSources({ reader: "staff", env: ON });
  const held = sources.rows.find((row) => row.vendor === "Vendor D");
  assert.equal(held?.moreChannels?.[0]?.label, "YouTube (via Google)");
  assert.equal(held?.moreChannels?.[0]?.hold, true);
  assert.equal(held?.moreChannels?.[0]?.percent, held?.match.find((row) => row.platform === "google_ads")?.percent);
  assert.equal(held?.moreChannels?.[1]?.label, "CTV (StackAdapt)");
  assert.equal(held?.moreChannels?.[1]?.percent, held?.match.find((row) => row.platform === "stackadapt")?.percent);
  const hidden = listAudienceSources({ reader: "staff", env: {} });
  assert.equal(hidden.rows[0]?.moreChannels, undefined);
  const model = assemblePortfolio({
    facts: [portfolioFacts()],
    allowedIds: ["gulf"],
    showMoney: false,
    now: new Date("2026-10-31T18:00:00.000Z"),
    env: ON,
  });
  assert.equal(model.clients[0]?.channels, 2);
  assert.equal(model.clients[0]?.moreChannels?.[1]?.label, "CTV (StackAdapt)");
  assert.match(model.clients[0]?.moreChannels?.[1]?.status || "", /StackAdapt/);
  assert.equal(portfolioHasSpend(model.clients[0]?.moreChannels), false);
  assert.deepEqual(collectsCostKeys(model.clients[0]?.moreChannels), []);
  const quiet = assemblePortfolio({
    facts: [portfolioFacts()],
    allowedIds: ["gulf"],
    showMoney: false,
    now: new Date("2026-10-31T18:00:00.000Z"),
    env: {},
  });
  assert.equal(quiet.clients[0]?.moreChannels, undefined);
});

test("YouTube and CTV add no connector and leave the public login page unchanged", () => {
  const files = [
    "lib/marketing/channels/video-channels.ts",
    "components/jarvis/more-channels.tsx",
    "components/jarvis/pages.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(/https?:\/\//.test(source), false, file);
    assert.equal(source.includes("prisma"), false, file);
  }
  const registry = readFileSync(path.join(ROOT, "lib/marketing/connectors/registry.ts"), "utf8");
  assert.equal(/youtube|ctv/i.test(registry), false);
  for (const file of ["app/login/page.tsx", "components/login-form.tsx", "components/login-analytics-screen.tsx"]) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("YouTube"), false, file);
    assert.equal(source.includes("Other CTV"), false, file);
    assert.equal(source.includes("Connected TV"), false, file);
  }
});

function portfolioFacts(): PortfolioFacts {
  return {
    id: "gulf",
    name: "Gulf Pest",
    channels: 2,
    leads: 40,
    conversions: 4,
    qualityScores: [60, 80],
    crmOutcome: true,
    scale: 1,
    learning: 2,
    cut: 0,
    alerts: 1,
    pixelCheckedAt: "2026-10-31T16:00:00.000Z",
    pixelsMissing: false,
    matchMatched: 8,
    matchTotal: 10,
    speedSeconds: [30, 50],
    callOutcomes: { answered: 3, booked: 1, noAnswer: 2, voicemail: 0, other: 0 },
    spend: 400,
  };
}

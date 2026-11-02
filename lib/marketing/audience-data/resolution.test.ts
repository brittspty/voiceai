import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { collectsCostKeys } from "../channels/cost-strip";
import { resolutionDataEnabled } from "../config";
import { classifyPlatforms, rateBand, readResolution, withIdentifier } from "./resolution";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const COST = ["cpm", "spend", "cpl", "cpa", "roas", "dataCostCpm"];

test("RESOLUTION_DATA stays off until it is turned on", () => {
  assert.equal(resolutionDataEnabled({}), false);
  assert.equal(resolutionDataEnabled({ AUDIENCE_DATA: "on" }), false);
  assert.equal(resolutionDataEnabled({ RESOLUTION_DATA: "on" }), true);
  assert.match(readFileSync(path.join(ROOT, ".env.example"), "utf8"), /RESOLUTION_DATA=off/);
});

test("match rate uses a number, a word, and a hold under 30%", () => {
  assert.equal(rateBand(64).word, "Good");
  assert.equal(rateBand(50).hold, false);
  assert.equal(rateBand(49).word, "Fair");
  assert.equal(rateBand(30).word, "Fair");
  assert.equal(rateBand(29).hold, true);
  assert.equal(rateBand(27).word, "Low — on hold");
});

test("the staff summary matches the example and does not use a Trade Desk placeholder", () => {
  const result = readResolution({ reader: "staff" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const body = result.body;
  assert.equal(body.title, "Resolution Data across all audiences");
  assert.equal(body.uploaded, 5_030_000);
  assert.deepEqual(body.parts.map((part) => part.id), ["maid", "email", "phone", "ipv4", "ipv6"]);
  assert.deepEqual(body.parts.map((part) => part.label), [
    "MAID (mobile ad ID)",
    "Hashed email",
    "Phone",
    "IPv4 / household",
    "IPv6 / household",
  ]);
  assert.equal(body.parts.reduce((sum, part) => sum + part.uploaded, 0), body.uploaded);
  assert.equal(body.parts.reduce((sum, part) => sum + part.matched, 0), body.matchedAny);
  assert.equal(body.parts.reduce((sum, part) => sum + part.unmatched, 0), body.unmatched);
  assert.deepEqual(body.platforms.map((row) => row.label), ["Meta", "Google", "StackAdapt"]);
  for (const id of ["meta", "google_ads", "stackadapt"]) {
    assert.equal(body.platforms.find((row) => row.id === id)?.placeholder, false, id);
  }
  assert.equal(body.platforms.some((row) => row.id === "trade_desk"), false);
  assert.equal(JSON.stringify(body).includes("Trade Desk"), false);
  assert.ok(body.bySource.some((row) => row.label === "Vendor A"));
  assert.deepEqual(body.windows[30].points.map((point) => point.percent), [58, 59, 61, 60, 62, 63]);
  assert.equal(body.windows[60].points[0]?.percent, 54);
  assert.equal(body.windows[90].points[0]?.percent, 49);
  assert.match(body.recommendation, /Nothing changes/);
  assert.deepEqual(collectsCostKeys(body), []);
  assert.equal(JSON.stringify(body).includes("@"), false);
  const source = readResolution({ reader: "staff", sourceId: "vendor-a" });
  assert.equal(source.ok, true);
  if (source.ok) assert.match(source.body.title, /Vendor A/);
});

test("client and share resolution drops vendor identity and cost and stays on their campaigns", () => {
  for (const reader of ["client", "share"] as const) {
    const result = readResolution({ reader, ownAccountId: "org" });
    assert.equal(result.ok, true, reader);
    if (!result.ok) continue;
    const text = JSON.stringify(result.body);
    assert.equal(result.body.title, "Resolution Data across your audiences");
    assert.ok(result.body.bySource.some((row) => row.label === "Intent data source"));
    assert.equal(result.body.bySource.some((row) => row.label === "Vendor A"), false);
    assert.equal("vendor" in result.body, false);
    assert.equal(/vendor|vnd_|seg_/i.test(text), false, reader);
    assert.deepEqual(collectsCostKeys(result.body), []);
    for (const key of COST) assert.equal(text.includes(`"${key}"`), false, key);
    assert.match(result.body.recommendation, /your Specificity team may suggest/);
    assert.equal(text.includes("@"), false);
  }
  const other = readResolution({ reader: "client", ownAccountId: "org", requestedAccountId: "gulf" });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.status, 403);
  const foreignCampaign = readResolution({ reader: "client", ownAccountId: "org", campaignId: "spring" });
  assert.equal(foreignCampaign.ok, false);
  if (!foreignCampaign.ok) assert.equal(foreignCampaign.status, 403);
  const gulf = readResolution({ reader: "share", ownAccountId: "gulf", sourceId: "1" });
  assert.equal(gulf.ok, true);
  if (gulf.ok) {
    assert.equal(gulf.body.bySource[0]?.label, "Firmographic data source");
    assert.equal(gulf.body.uploaded, 80_000);
    assert.deepEqual(gulf.body.parts.map((part) => part.id), ["maid", "email", "phone", "ipv4", "ipv6"]);
    assert.equal(gulf.body.parts.reduce((sum, part) => sum + part.uploaded, 0), 80_000);
    assert.equal(gulf.body.parts.reduce((sum, part) => sum + part.matched, 0), gulf.body.matchedAny);
    assert.equal(gulf.body.platforms.every((row) => row.placeholder === false), true);
    assert.equal(/vendor/i.test(JSON.stringify(gulf.body)), false);
  }
  const leaked = readResolution({ reader: "client", ownAccountId: "org", sourceId: "vendor-a" });
  assert.equal(leaked.ok, false);
});

test("identifier types and platforms stay open for later additions", () => {
  const result = readResolution({ reader: "staff" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const extended = withIdentifier(result.body.parts, {
    id: "address",
    label: "Postal address",
    short: "addresses",
    uploaded: 10,
    matched: 4,
    unmatched: 6,
    percent: 40,
  });
  assert.equal(extended.length, result.body.parts.length + 1);
  assert.equal(extended.at(-1)?.id, "address");
  const rows = classifyPlatforms([
    { id: "meta", label: "Meta" },
    { id: "google_ads", label: "Google" },
    { id: "stackadapt", label: "StackAdapt" },
    { id: "linkedin", label: "LinkedIn" },
  ]);
  assert.deepEqual(rows.map((row) => row.placeholder), [false, false, false, true]);
});

test("resolution screens make no outbound call", () => {
  const files = [
    "lib/marketing/audience-data/resolution.ts",
    "components/audience-data/resolution-panel.tsx",
    "app/api/marketing/audience-data/[sourceId]/resolution/route.ts",
    "app/(app)/audience-data/resolution/page.tsx",
    "app/(app)/audience-data/[sourceId]/resolution/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(/https?:\/\//.test(source), false, file);
    assert.equal(source.includes("prisma"), false, file);
  }
  const tabs = readFileSync(path.join(ROOT, "components/audience-data/screens.tsx"), "utf8");
  assert.match(tabs, /Selections/);
  assert.match(tabs, /Resolution Data/);
});

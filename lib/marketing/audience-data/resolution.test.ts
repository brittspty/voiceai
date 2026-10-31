import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { collectsCostKeys } from "../channels/cost-strip";
import { resolutionDataEnabled } from "../config";
import { readResolution } from "./resolution";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const COST = ["cpm", "spend", "cpl", "cpa", "roas", "dataCostCpm"];

test("RESOLUTION_DATA stays off until it is turned on", () => {
  assert.equal(resolutionDataEnabled({}), false);
  assert.equal(resolutionDataEnabled({ AUDIENCE_DATA: "on" }), false);
  assert.equal(resolutionDataEnabled({ RESOLUTION_DATA: "on" }), true);
  assert.match(readFileSync(path.join(ROOT, ".env.example"), "utf8"), /RESOLUTION_DATA=off/);
});

test("staff resolution is counts by platform, identifier, source, and week", () => {
  const result = readResolution({
    reader: "staff",
    sourceId: "vendor-a",
    extraPlatforms: [{ id: "other", label: "Other network", rate: 0.5 }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const body = result.body;
  assert.equal(body.example, true);
  assert.equal(body.vendor, "Vendor A");
  assert.deepEqual(body.parts.map((part) => part.kind), ["maid", "email", "phone"]);
  assert.equal(body.parts.reduce((sum, part) => sum + part.count, 0), body.uploaded);
  assert.deepEqual(body.platforms.map((platform) => platform.label), ["Meta", "Google", "StackAdapt", "Other network"]);
  for (const platform of body.platforms) {
    assert.equal(platform.matched + platform.unmatched > 0, true, platform.id);
    assert.match(platform.rateLabel, /%$/);
  }
  assert.equal(body.byIdentifier.length, 3);
  assert.ok(body.bySource.some((row) => row.label === "Vendor A"));
  assert.equal(body.trend.length, 6);
  assert.equal(JSON.stringify(body).includes("@"), false);
});

test("client and share resolution drops vendor identity and cost and stays on one account", () => {
  for (const reader of ["client", "share"] as const) {
    const result = readResolution({ reader, sourceId: "1", ownAccountId: "org" });
    assert.equal(result.ok, true, reader);
    if (!result.ok) continue;
    const text = JSON.stringify(result.body);
    assert.equal(result.body.label, "Intent data source 1");
    assert.equal(result.body.id, "1");
    assert.equal("vendor" in result.body, false);
    assert.equal(/vendor|vnd_|seg_/i.test(text), false, reader);
    assert.deepEqual(collectsCostKeys(result.body), [], reader);
    for (const key of COST) assert.equal(text.includes(`"${key}"`), false, `${reader} ${key}`);
    assert.equal(text.includes("@"), false);
    assert.ok(result.body.bySource.every((row) => row.label !== "Vendor A"));
  }
  const other = readResolution({ reader: "client", sourceId: "1", ownAccountId: "org", requestedAccountId: "gulf" });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.status, 403);
  const gulf = readResolution({ reader: "share", sourceId: "1", ownAccountId: "gulf" });
  assert.equal(gulf.ok, true);
  if (gulf.ok) assert.equal(gulf.body.label, "Firmographic data source");
  const leaked = readResolution({ reader: "client", sourceId: "vendor-a", ownAccountId: "org" });
  assert.equal(leaked.ok, false);
});

test("resolution data makes no outbound call", () => {
  const files = [
    "lib/marketing/audience-data/resolution.ts",
    "components/audience-data/resolution-panel.tsx",
    "app/api/marketing/audience-data/[sourceId]/resolution/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(/https?:\/\//.test(source), false, file);
    assert.equal(source.includes("prisma"), false, file);
  }
  const route = readFileSync(path.join(ROOT, "app/api/marketing/audience-data/[sourceId]/resolution/route.ts"), "utf8");
  assert.match(route, /resolutionDataEnabled/);
  assert.match(route, /readResolution/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { audienceDataEnabled } from "../config";
import { clientViewerAllowed } from "../client-gate";
import { jarvisNav } from "../channels/nav";
import { collectsCostKeys } from "../channels/cost-strip";
import { EXAMPLE_SOURCES } from "./example";
import { audienceDataPayload, audienceSourceDetail, canOpenAudienceData, listAudienceSources } from "./present";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const COST = ["dataCostCpm", "cpm", "spend", "cpl", "cpa", "roas"];

test("AUDIENCE_DATA stays off until it is turned on", () => {
  assert.equal(audienceDataEnabled({}), false);
  assert.equal(audienceDataEnabled({ AUDIENCE_DATA: "off" }), false);
  assert.equal(audienceDataEnabled({ AUDIENCE_DATA: "on" }), true);
  const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(example, /AUDIENCE_DATA=off/);
});

test("client roles and share links cannot open Audience Data", () => {
  for (const kind of ["client_owner", "client_viewer", "share", "none"]) {
    assert.equal(canOpenAudienceData(kind), false, kind);
  }
  for (const kind of ["super_admin", "account_manager", "staff", "all_clients_viewer"]) {
    assert.equal(canOpenAudienceData(kind), true, kind);
  }
  assert.equal(clientViewerAllowed("/audience-data"), false);
  assert.equal(clientViewerAllowed("/audience-data/vendor-a"), false);
  assert.equal(clientViewerAllowed("/api/marketing/audience-data"), false);
  assert.equal(clientViewerAllowed("/api/marketing/audience-data/vendor-a"), false);
  assert.equal(clientViewerAllowed("/audience-data", { JARVIS_UI_V2: "on" }), false);
  const client = jarvisNav({ audience: "client", showAis2l: true, decisionCount: 0, showLive: false, showAudienceData: true, showSegments: true });
  assert.equal(client.some((item) => item.href === "/audience-data"), false);
  const staff = jarvisNav({ audience: "staff", showAis2l: true, decisionCount: 1, showLive: true, showAudienceData: true });
  const item = staff.find((row) => row.href === "/audience-data");
  assert.equal(item?.label, "Audience Data");
  assert.equal(item?.group, "Data");
  const hidden = jarvisNav({ audience: "staff", showAis2l: false, decisionCount: 0, showLive: false, showAudienceData: false });
  assert.equal(hidden.some((row) => row.href === "/audience-data"), false);
});

test("the server strips data cost, spend, CPL, CPA, and ROAS from client and share payloads", () => {
  for (const reader of ["client", "share"] as const) {
    const payload = audienceDataPayload(reader);
    assert.deepEqual(collectsCostKeys(payload), [], reader);
    for (const key of COST) {
      assert.equal(JSON.stringify(payload).includes(`"${key}"`), false, `${reader} ${key}`);
    }
    assert.equal(payload.list.rows[0]?.leads, 412);
    assert.equal(payload.detail?.vendor, "Vendor A");
    assert.equal(payload.detail?.recommendationOnly, true);
    assert.equal("dataCostCpm" in (payload.detail || {}), false);
  }
  const staff = audienceDataPayload("staff");
  assert.equal(staff.detail?.dataCostCpm, 3.1);
  assert.equal(staff.list.rows.find((row) => row.id === "vendor-a")?.spend, 1840);
  assert.equal(staff.list.recommendationOnly, true);
  assert.equal(staff.list.example, true);
});

test("level 1 lists every source and filters by campaign, search, and sort", () => {
  const all = listAudienceSources({ reader: "staff" });
  assert.equal(all.rows.length, 5);
  assert.equal(all.summary, "5 sources · 24 audiences · 6.68M MAIDs");
  assert.deepEqual(all.rows.map((row) => row.vendor), ["Vendor A", "Vendor B", "Vendor C", "Vendor D", "Vendor E"]);
  assert.equal(all.rows[1]?.match.find((row) => row.platform === "stackadapt")?.hold, true);
  assert.equal(all.rows[3]?.match.find((row) => row.platform === "google_ads")?.hold, true);
  assert.equal(all.rows[4]?.stale, true);
  assert.match(all.rows[4]?.refreshed || "", /stale/);
  assert.equal(all.rows[4]?.leadQuality, null);
  assert.equal(all.rows[2]?.provisional, true);
  const harbor = listAudienceSources({ reader: "staff", campaignId: "harbor" });
  assert.deepEqual(harbor.rows.map((row) => row.id), ["vendor-a", "vendor-b", "vendor-c"]);
  const none = listAudienceSources({ reader: "staff", search: "vendor z" });
  assert.equal(none.rows.length, 0);
  const firm = listAudienceSources({ reader: "staff", search: "firmographic", sort: "vendor", direction: "asc" });
  assert.deepEqual(firm.rows.map((row) => row.vendor), ["Vendor E"]);
});

test("level 2 shows every selection group, lineage counts, and a recommendation", () => {
  const detail = audienceSourceDetail("vendor-a", "staff");
  assert.ok(detail);
  assert.equal(detail?.selectionCount, 13);
  assert.deepEqual(detail?.groups.map((group) => group.title), ["Intent", "Demographics", "Geography", "Behavioral / purchase", "Device / app", "Firmographic"]);
  assert.deepEqual(detail?.groups.map((group) => group.count), [4, 3, 2, 1, 2, 1]);
  const recency = detail?.groups[0]?.selections[3];
  assert.equal(recency?.logic, "AND (narrows)");
  assert.equal(recency?.qualityLabel, "Not measurable alone");
  assert.equal(recency?.maidsLabel, "−1.12M");
  assert.match(detail?.groups[0]?.selections[0]?.logic || "", /Include · OR/);
  assert.equal(detail?.groups[5]?.selections[0]?.value, "Not used: B2C audience");
  assert.match(detail?.why || "", /Intent topics drive 86%/);
  assert.match(detail?.recommendation || "", /Nothing changes/);
  assert.equal(detail?.recommendationOnly, true);
  assert.equal(audienceSourceDetail("missing", "staff"), null);
  assert.equal(EXAMPLE_SOURCES.length, 5);
  for (const source of EXAMPLE_SOURCES) {
    const view = audienceSourceDetail(source.id, "client");
    assert.equal(view?.groups.length, 6, source.id);
    assert.equal(collectsCostKeys(view).length, 0, source.id);
  }
});

test("example audience data makes no outbound call", () => {
  const files = [
    "lib/marketing/audience-data/example.ts",
    "lib/marketing/audience-data/present.ts",
    "components/audience-data/screens.tsx",
    "app/api/marketing/audience-data/route.ts",
    "app/api/marketing/audience-data/[sourceId]/route.ts",
    "app/(app)/audience-data/page.tsx",
    "app/(app)/audience-data/[sourceId]/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.includes("fetch("), false, file);
    assert.equal(/https?:\/\//.test(source), false, file);
    assert.equal(source.includes("prisma"), false, file);
  }
  const route = readFileSync(path.join(ROOT, "app/api/marketing/audience-data/route.ts"), "utf8");
  assert.match(route, /canOpenAudienceData/);
  assert.match(route, /audienceDataEnabled/);
});

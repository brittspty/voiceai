import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { audienceLibraryEnabled, audiencePushEnabled, listValidationConfig, listValidationGateEnabled } from "./config";
import { AdBudgetWriteBlockedError } from "./connectors/budget-lock";
import { compareMaidAudiences } from "./audiences/compare";
import { importMaidApi, importMaidCsv, staffCost } from "./audiences/import";
import { audienceFreshness, presentLibrary, STALE_AFTER_DAYS, type LibraryAudience } from "./audiences/library";
import { decryptMaid, dedupeIdentifiers, hashMaid, normalizeMaid } from "./audiences/maid";
import { PIXEL_FIX_GUIDE, dryRunPoolSync, pixelPageHealth, poolGrowth } from "./audiences/pixel-health";
import { attributeConversions, audienceIdFromSearch, audienceQuery, countVerified } from "./audiences/pixel";
import { clientLeakKeys, costKeys } from "./audiences/present";
import { AUDIENCE_UNDO_MS, applyPushDecision, audienceUndoToast, deliverAudienceUpload, finalizePush, prepareAudiencePush } from "./audiences/push";
import { buildGooglePayload, buildMetaPayload } from "./audiences/payloads";
import { GOOGLE_FIRST_PARTY_ONLY, GoogleCustomerMatchBlockedError, googleBrokeredAllowlisted, googleCustomerMatchEligible } from "./audiences/google-policy";
import { assignHoldout, GOOGLE_POLICY_WARNING, googleMatchSanity, holdoutArm, listValidationFlags, planSeedCheck, seedMatchFlag } from "./audiences/list-validation";
import { AUDIENCE_SOURCES, SEGMENT_DIMENSIONS, isMaidComparisonSource } from "./segment-taxonomy";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NOW = new Date("2026-10-31T12:00:00.000Z");
const IDFA = "aebe52e7-03ee-455a-b3c4-e57283966239";
const NORMAL_IDFA = "AEBE52E7-03EE-455A-B3C4-E57283966239";
const KEY = "11".repeat(32);

function libraryRow(patch: Partial<LibraryAudience> = {}): LibraryAudience {
  return {
    id: "aud-1",
    name: "Homeowners",
    source: "data_market_maid",
    vendor: "SecretVendor",
    listId: "list-100",
    consentBasis: "contract",
    refreshCadence: "monthly",
    acquisitionDate: "2026-10-20",
    cost: "250.0000",
    size: 2,
    tags: [{ dimension: "intent", key: "roofing", label: "Roofing" }],
    platforms: [{ platform: "meta", uploaded: 100, matched: 80, reach: 70, spend: 140 }],
    verifiedConversions: 10,
    verifiedLeads: 8,
    qualifiedLeads: 4,
    pixelVisitors: 3,
    dataLabel: "",
    gppString: "",
    consentOrigin: "",
    pushes: [{ id: "push-1", platform: "meta", status: "pending", undoUntil: null }],
    ...patch,
  };
}

test("audience switches default off and the live switch needs both", () => {
  assert.equal(audienceLibraryEnabled({}), false);
  assert.equal(audienceLibraryEnabled({ AUDIENCE_LIBRARY: "off" }), false);
  assert.equal(audienceLibraryEnabled({ AUDIENCE_LIBRARY: "on" }), true);
  assert.equal(audiencePushEnabled({ AUDIENCE_PUSH_ENABLED: "on" }), false);
  assert.equal(audiencePushEnabled({ AUDIENCE_LIBRARY: "on", AUDIENCE_PUSH_ENABLED: "on" }), true);
});

test("IDFA and GAID are normalized, hashed, and deduped", () => {
  assert.equal(normalizeMaid(IDFA, "idfa"), NORMAL_IDFA);
  assert.equal(normalizeMaid(`{${NORMAL_IDFA}}`, "idfa"), NORMAL_IDFA);
  assert.equal(normalizeMaid("00000000-0000-0000-0000-000000000000", "gaid"), null);
  assert.equal(normalizeMaid("not-a-maid", "gaid"), null);
  const gaid = normalizeMaid(NORMAL_IDFA, "gaid");
  assert.equal(gaid, NORMAL_IDFA.toLowerCase());
  const hash = hashMaid(NORMAL_IDFA);
  assert.equal(hash, createHash("sha256").update(NORMAL_IDFA, "utf8").digest("hex"));
  assert.equal(hashMaid(normalizeMaid(IDFA, "idfa") || ""), hash);
  const deduped = dedupeIdentifiers([
    { idType: "idfa", hash, rawEncrypted: null },
    { idType: "idfa", hash, rawEncrypted: null },
    { idType: "gaid", hash: hashMaid(gaid || ""), rawEncrypted: null },
  ]);
  assert.equal(deduped.unique.length, 2);
  assert.equal(deduped.duplicates, 1);
});

test("CSV and API imports hash, dedupe, and encrypt raw MAIDs only when allowed", () => {
  const csv = importMaidCsv(
    `maid,id_type,email\n${IDFA},idfa,a@b.com\n${NORMAL_IDFA},idfa,\n`,
    {
      name: "Homeowners",
      vendor: "SecretVendor",
      listId: "list-100",
      consentBasis: "contract",
      refreshCadence: "monthly",
      acquisitionDate: "2026-10-01",
      cost: "10.00",
    },
    { retainRaw: false, maidKey: KEY },
  );
  assert.equal(csv.ok, true);
  if (!csv.ok) return;
  assert.equal(csv.value.identifiers.filter((row) => row.idType === "idfa").length, 1);
  assert.equal(csv.value.duplicates, 1);
  assert.equal(csv.value.identifiers.some((row) => row.idType === "email_sha256"), true);
  assert.equal(csv.value.rawStored, false);
  assert.equal(csv.value.identifiers.every((row) => row.rawEncrypted === null), true);
  assert.equal(JSON.stringify(csv.value.identifiers).includes(NORMAL_IDFA), false);

  const kept = importMaidApi({
    name: "Homeowners",
    vendor: "SecretVendor",
    listId: "list-100",
    consentBasis: "consent",
    refreshCadence: "weekly",
    acquisitionDate: "2026-10-01",
    cost: "10.00",
    identifiers: [{ maid: IDFA, idType: "idfa" }],
  }, { retainRaw: true, maidKey: KEY });
  assert.equal(kept.ok, true);
  if (!kept.ok) return;
  const encrypted = kept.value.identifiers[0]?.rawEncrypted || "";
  assert.equal(kept.value.rawStored, true);
  assert.equal(encrypted.includes(NORMAL_IDFA), false);
  assert.equal(decryptMaid(encrypted, Buffer.from(KEY, "hex")), NORMAL_IDFA);
  assert.equal(staffCost(false, kept.value.lineage.cost), null);
});

test("a list is stale after 30 days", () => {
  assert.equal(STALE_AFTER_DAYS, 30);
  assert.equal(audienceFreshness("2026-10-01", NOW).freshness, "fresh");
  assert.equal(audienceFreshness("2026-09-30", NOW).freshness, "stale");
  assert.equal(audienceFreshness(null, NOW).freshness, "unknown");
});

test("yes waits 30 seconds, undo restores the decision, and the log is a dry run", async () => {
  const pending = { status: "pending" as const, undoUntil: null, log: "", steps: [], finalized: false };
  const yes = applyPushDecision(pending, "yes", NOW);
  assert.equal(yes.status, "approved");
  assert.equal(Date.parse(yes.undoUntil || "") - NOW.getTime(), AUDIENCE_UNDO_MS);
  assert.match(yes.log, /Undo/);
  assert.equal(audienceUndoToast(30), "Approved. Undo · 30s");
  const undone = applyPushDecision(yes, "undo", new Date(NOW.getTime() + 10_000));
  assert.equal(undone.status, "pending");
  assert.equal(undone.undoUntil, null);
  const expired = applyPushDecision(yes, "undo", new Date(NOW.getTime() + AUDIENCE_UNDO_MS + 1));
  assert.equal(expired.status, "approved");
  const no = applyPushDecision(pending, "no", NOW);
  assert.equal(no.status, "declined");
  assert.match(no.log, /Nothing was uploaded/);
  let calls = 0;
  const payload = buildMetaPayload([{ idType: "idfa", hash: "ab".repeat(32) }]);
  const held = await deliverAudienceUpload({
    env: { AUDIENCE_LIBRARY: "on", AUDIENCE_PUSH_ENABLED: "on" },
    platform: "meta",
    payload,
    listId: "list-100",
    vendor: "SecretVendor",
    fetchImpl: async () => {
      calls += 1;
      return { status: 200 };
    },
  });
  assert.equal(calls, 0);
  assert.equal(held.mode, "dry_run");
  assert.match(held.log, /Nothing is sent|Logged only|Live upload is off|https/);
  const closed = finalizePush(yes, new Date(NOW.getTime() + AUDIENCE_UNDO_MS + 1), { log: held.log, steps: held.steps });
  assert.equal(closed.write, true);
  assert.equal(closed.card.finalized, true);
  assert.equal(closed.card.undoUntil, null);
  const early = finalizePush(yes, new Date(NOW.getTime() + 1000), { log: held.log, steps: held.steps });
  assert.equal(early.write, false);
});

test("the live write stays behind the switch and budget fields never leave", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 204 };
  };
  const payload = buildMetaPayload([{ idType: "gaid", hash: "cd".repeat(32) }]);
  const off = await deliverAudienceUpload({
    env: { AUDIENCE_PUSH_URL_META: "https://upload.test/audiences" },
    platform: "meta",
    payload,
    listId: "list-100",
    vendor: "SecretVendor",
    fetchImpl,
  });
  assert.equal(off.called, false);
  assert.equal(calls, 0);
  const on = await deliverAudienceUpload({
    env: { AUDIENCE_LIBRARY: "on", AUDIENCE_PUSH_ENABLED: "on", AUDIENCE_PUSH_URL_META: "https://upload.test/audiences" },
    platform: "meta",
    payload,
    listId: "list-100",
    vendor: "SecretVendor",
    fetchImpl,
  });
  assert.equal(on.called, true);
  assert.equal(on.mode, "live");
  assert.equal(calls, 1);
  await assert.rejects(
    () => deliverAudienceUpload({
      env: { AUDIENCE_LIBRARY: "on", AUDIENCE_PUSH_ENABLED: "on", AUDIENCE_PUSH_URL_META: "https://upload.test/audiences" },
      platform: "meta",
      payload: { daily_budget: "50" },
      listId: "list-100",
      vendor: "SecretVendor",
      fetchImpl,
    }),
    AdBudgetWriteBlockedError,
  );
  assert.equal(calls, 1);
  const store = readFileSync(path.join(ROOT, "lib/marketing/audiences/store.ts"), "utf8");
  const finalize = store.slice(store.indexOf("export async function finalizeDuePushes"), store.indexOf("export async function listAudiencePushes"));
  assert.equal(finalize.includes("fetchImpl"), false);
  assert.match(store, /assertNoAdBudgetWrite|deliverAudienceUpload/);
  assert.match(readFileSync(path.join(ROOT, "lib/marketing/audiences/push.ts"), "utf8"), /assertNoAdBudgetWrite\(/);
});

test("only deduped MAID conversions with a contact check count as verified", () => {
  const rows = attributeConversions([
    { audienceId: "aud-1", source: "data_market_maid", visitorId: "v1", externalId: "lead-1", kind: "lead", qualified: true, email: "a@b.com" },
    { audienceId: "aud-1", source: "data_market_maid", visitorId: "v1", externalId: "lead-1", kind: "lead", qualified: true, email: "a@b.com" },
    { audienceId: "aud-1", source: "data_market_maid", visitorId: "v2", externalId: "lead-2", kind: "lead", qualified: false, email: "not-an-email" },
    { audienceId: "aud-1", source: "platform_native", visitorId: "v3", externalId: "lead-3", kind: "lead", qualified: true, email: "c@d.com" },
    { audienceId: "aud-1", source: "data_market_maid", visitorId: "v4", externalId: "lead-4", kind: "sale", qualified: true, maid: IDFA, idType: "idfa" },
  ]);
  assert.equal(countVerified(rows), 2);
  assert.equal(rows[1]?.reason, "Duplicate conversion.");
  assert.equal(rows[2]?.reason, "Contact check failed.");
  assert.match(rows[3]?.reason || "", /MAID campaign/);
  assert.equal(rows[4]?.status, "verified");
});

test("client views drop cost, vendor, and match rate", () => {
  const staff = presentLibrary([libraryRow()], { reader: "staff", seesCost: true, now: NOW });
  const hiddenCost = presentLibrary([libraryRow()], { reader: "staff", seesCost: false, now: NOW });
  const client = presentLibrary([libraryRow()], { reader: "client", seesCost: true, now: NOW });
  assert.equal(costKeys(hiddenCost).length, 0);
  assert.equal(costKeys(staff).length > 0, true);
  assert.equal(clientLeakKeys(client).length, 0);
  const clientJson = JSON.stringify(client);
  assert.equal(clientJson.includes("SecretVendor"), false);
  assert.equal(clientJson.includes("250.0000"), false);
  assert.equal(clientJson.includes("matchRate"), false);
  assert.equal(JSON.stringify(staff).includes("SecretVendor"), true);
  assert.equal(staff.cards[0]?.platforms[0]?.matchRateLabel, "80.0%");
  assert.equal(staff.cards[0]?.pushStatus[0]?.statusLabel, "Waiting for Yes");
});

test("MAID lists, vendors, and sub-segments are compared, and a weak match rate is held", () => {
  const strong = libraryRow({ id: "strong", vendor: "North", listId: "list-north", verifiedConversions: 20, verifiedLeads: 20, qualifiedLeads: 10 });
  const weak = libraryRow({
    id: "weak",
    name: "Weak list",
    vendor: "South",
    listId: "list-south",
    tags: [{ dimension: "geo", key: "gulf", label: "Gulf" }],
    platforms: [{ platform: "meta", uploaded: 100, matched: 10, reach: 10, spend: 50 }],
    verifiedConversions: 4,
    verifiedLeads: 4,
    qualifiedLeads: 1,
  });
  const legacy = libraryRow({ id: "old", source: "platform_native", vendor: "Platform", listId: "lookalike", verifiedConversions: 99 });
  const board = compareMaidAudiences([strong, weak, legacy].map((row) => ({
    id: row.id,
    name: row.name,
    source: row.source,
    vendor: row.vendor,
    listId: row.listId,
    tags: row.tags,
    platforms: row.platforms,
    verifiedConversions: row.verifiedConversions,
    verifiedLeads: row.verifiedLeads,
    qualifiedLeads: row.qualifiedLeads,
  })));
  assert.equal(board.lists.some((row) => row.listId === "lookalike"), false);
  assert.equal(isMaidComparisonSource("platform_native"), false);
  assert.equal(board.lists[0]?.listId, "list-north");
  assert.match(board.lists[0]?.recommendation || "", /list-north/);
  assert.match(board.lists[0]?.recommendation || "", /North/);
  assert.equal(board.lists.find((row) => row.listId === "list-south")?.holdVerdict, true);
  assert.equal(board.lists.find((row) => row.listId === "list-south")?.dataQuality, "flagged");
  assert.equal(board.vendors.some((row) => row.vendor === "North"), true);
  assert.equal(board.subsegments.some((row) => row.label === "Roofing"), true);
  assert.equal(board.subsegments.some((row) => row.label === "Gulf"), true);
});

test("pixel health, pool growth, and the four-step dry-run sync", () => {
  assert.equal(PIXEL_FIX_GUIDE.length, 4);
  const events = [
    { pageUrl: "https://example.com/a", eventName: "page_view", visitorId: "v1", audienceId: "aud-1", occurredAt: "2026-10-31T11:00:00.000Z" },
    { pageUrl: "https://example.com/a", eventName: "page_view", visitorId: "v2", audienceId: "aud-1", occurredAt: "2026-10-20T11:00:00.000Z" },
    { pageUrl: "https://example.com/b", eventName: "page_view", visitorId: "v3", audienceId: "aud-1", occurredAt: "2026-10-01T11:00:00.000Z" },
  ];
  const pages = pixelPageHealth({
    pages: [{ name: "Quote", url: "https://example.com/a" }, { name: "Quiet form", url: "https://example.com/c" }],
    events,
    now: NOW,
  });
  assert.equal(pages.find((page) => page.pageName === "Quote")?.health, "healthy");
  assert.equal(pages.find((page) => page.pageName === "Quote")?.eventsCaptured, 2);
  assert.equal(pages.find((page) => page.pageUrl === "https://example.com/b")?.health, "down");
  assert.equal(pages.find((page) => page.pageName === "Quiet form")?.health, "down");
  const pools = poolGrowth({ audiences: [{ id: "aud-1", name: "Homeowners", listId: "list-100" }], events, now: NOW });
  assert.equal(pools[0]?.size, 3);
  assert.equal(pools[0]?.addedThisWeek, 1);
  const sync = dryRunPoolSync({ platform: "meta", visitorIds: ["v1", "v1", "v2"], listId: "list-100", vendor: "SecretVendor" });
  assert.equal(sync.called, false);
  assert.equal(sync.mode, "dry_run");
  assert.match(sync.log, /Nothing was sent/);
  assert.equal(audienceIdFromSearch(audienceQuery("aud-1", "list-100")), "aud-1");
});

test("Google Customer Match blocks brokered lists, including a dry run, unless that account is allowlisted", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 200 };
  };
  const live = { AUDIENCE_LIBRARY: "on", AUDIENCE_PUSH_ENABLED: "on", AUDIENCE_PUSH_URL_GOOGLE: "https://upload.test/google" };
  const members = [{ idType: "idfa" as const, hash: "ab".repeat(32) }];
  await assert.rejects(
    () => deliverAudienceUpload({
      env: live,
      platform: "google_customer_match",
      payload: buildGooglePayload(members, "contract"),
      listId: "list-100",
      vendor: "SecretVendor",
      source: "data_market_maid",
      fetchImpl,
    }),
    (error: unknown) => error instanceof GoogleCustomerMatchBlockedError && error.message === GOOGLE_FIRST_PARTY_ONLY,
  );
  assert.throws(
    () => prepareAudiencePush({ source: "data_market_maid", platform: "google_customer_match", members, consentBasis: "contract", env: live }),
    GoogleCustomerMatchBlockedError,
  );
  assert.equal(calls, 0);
  assert.equal(googleBrokeredAllowlisted("123", {}), false);
  assert.equal(googleBrokeredAllowlisted("123", { GOOGLE_BROKERED_ALLOWLISTED: "on" }), false);
  assert.equal(googleBrokeredAllowlisted("123", { GOOGLE_BROKERED_ALLOWLISTED: "999" }), false);
  const allowed = await deliverAudienceUpload({
    env: { ...live, GOOGLE_BROKERED_ALLOWLISTED: "123,456" },
    platform: "google_customer_match",
    payload: buildGooglePayload(members, "contract"),
    listId: "list-100",
    vendor: "SecretVendor",
    source: "maid_market",
    accountId: "123",
    fetchImpl,
  });
  assert.equal(allowed.called, true);
  const meta = await deliverAudienceUpload({
    env: { AUDIENCE_LIBRARY: "on" },
    platform: "meta",
    payload: buildMetaPayload(members),
    listId: "list-100",
    vendor: "SecretVendor",
    source: "maid_market",
    fetchImpl,
  });
  assert.equal(meta.mode, "dry_run");
  assert.equal(meta.called, false);
  const stack = dryRunPoolSync({ platform: "stackadapt", visitorIds: ["v1"], listId: "list-100", vendor: "SecretVendor", source: "maid_market" });
  assert.equal(stack.eligible, true);
  assert.equal(stack.mode, "dry_run");
  const blocked = dryRunPoolSync({ platform: "google_customer_match", visitorIds: ["v1"], listId: "list-100", vendor: "SecretVendor", source: "data_market_maid" });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.payload, null);
  assert.equal(blocked.log, GOOGLE_FIRST_PARTY_ONLY);
  const firstParty = dryRunPoolSync({ platform: "google_customer_match", visitorIds: ["v1"], listId: "crm-1", vendor: "House", source: "crm_first_party" });
  assert.equal(firstParty.eligible, true);
  assert.equal(firstParty.mode, "dry_run");
  const tagged = importMaidApi({
    name: "Homeowners",
    vendor: "SecretVendor",
    listId: "list-200",
    consentBasis: "contract",
    refreshCadence: "monthly",
    acquisitionDate: "2026-10-01",
    source: "maid_market",
    dataLabel: "IAB-DL-1",
    gppString: "DBABMA~",
    identifiers: [{ maid: IDFA, idType: "idfa" }],
  }, { retainRaw: false, maidKey: undefined });
  assert.equal(tagged.ok, true);
  if (!tagged.ok) return;
  assert.equal(tagged.value.source, "data_market_maid");
  assert.equal(tagged.value.consentProof.dataLabel, "IAB-DL-1");
  assert.equal(tagged.value.consentProof.gppString, "DBABMA~");
  const optional = importMaidApi({
    name: "Homeowners",
    vendor: "SecretVendor",
    listId: "list-201",
    consentBasis: "contract",
    refreshCadence: "monthly",
    acquisitionDate: "2026-10-01",
    identifiers: [{ maid: IDFA, idType: "idfa" }],
  }, { retainRaw: false, maidKey: undefined });
  assert.equal(optional.ok, true);
  if (!optional.ok) return;
  assert.equal(optional.value.consentProof.dataLabel, "");
  assert.equal(optional.value.consentProof.gppString, "");
  assert.equal(calls, 1);
});

test("list validation stays off and only recommends flags", () => {
  assert.equal(listValidationGateEnabled({}), false);
  const on = { LIST_VALIDATION_GATE: "on" };
  const row = {
    id: "aud-1",
    listId: "list-100",
    source: "data_market_maid",
    vendor: "SecretVendor",
    size: 200,
    consentOrigin: "upstream_supplier" as const,
    platforms: [{ platform: "google_customer_match", uploaded: 100, matched: 20 }],
  };
  assert.deepEqual(listValidationFlags(row, {}), []);
  const flags = listValidationFlags(row, on);
  assert.equal(flags.some((flag) => flag.code === "seed"), true);
  assert.match(flags.find((flag) => flag.code === "seed")?.message || "", /Nothing is sent/);
  assert.equal(flags.some((flag) => flag.code === "holdout"), true);
  assert.equal(flags.some((flag) => flag.code === "google_match"), true);
  assert.equal(flags.some((flag) => flag.code === "consent"), true);
  assert.equal(flags.some((flag) => flag.message === GOOGLE_POLICY_WARNING), true);
  assert.equal(googleCustomerMatchEligible({ platform: "google_customer_match", source: "data_market_maid" }).reason, GOOGLE_FIRST_PARTY_ONLY);
  const seeds = planSeedCheck(200, "list-100");
  assert.equal(seeds.seedCount, 6);
  assert.ok(seeds.seedPercent >= 0.02 && seeds.seedPercent <= 0.05);
  assert.equal(seedMatchFlag(100, 5).unreliable, false);
  assert.equal(seedMatchFlag(100, 6).unreliable, true);
  const arms = assignHoldout(Array.from({ length: 2000 }, (_, index) => ({ id: `id-${index}` })), "list-100");
  assert.equal(arms.holdout.length > 150 && arms.holdout.length < 250, true);
  assert.equal(arms.holdout.includes(arms.exposed[0]), false);
  assert.equal(holdoutArm("same", "salt", 0.1), holdoutArm("same", "salt", 0.1));
  assert.equal(googleMatchSanity(0.29).flagged, false);
  assert.equal(googleMatchSanity(0.62).flagged, false);
  assert.equal(googleMatchSanity(0.28).flagged, true);
  assert.equal(googleMatchSanity(0.63).flagged, true);
  assert.equal(googleMatchSanity(0.39, listValidationConfig({ LIST_VALIDATION_GOOGLE_MATCH_MIN: "40", LIST_VALIDATION_GOOGLE_MATCH_MAX: "50" })).flagged, true);
  assert.equal(googleMatchSanity(0.45, listValidationConfig({ LIST_VALIDATION_GOOGLE_MATCH_MIN: "40", LIST_VALIDATION_GOOGLE_MATCH_MAX: "50" })).flagged, false);
  assert.equal(listValidationFlags({ ...row, consentOrigin: "first_party", platforms: [], source: "crm_first_party" }, on).some((flag) => flag.code === "consent" || flag.code === "google_policy"), false);
  const source = readFileSync(path.join(ROOT, "lib/marketing/audiences/list-validation.ts"), "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("daily_budget"), false);
  assert.equal(source.includes("campaignBudgets"), false);
});

test("the shared taxonomy keeps platform-native as a legacy value", () => {
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  for (const source of AUDIENCE_SOURCES) assert.match(schema, new RegExp(source));
  for (const dimension of SEGMENT_DIMENSIONS) assert.match(schema, new RegExp(dimension));
  assert.match(schema, /platform_native is a legacy import/);
  const store = readFileSync(path.join(ROOT, "lib/marketing/audiences/store.ts"), "utf8");
  for (const part of store.split(/\nexport async function /).slice(1)) {
    if (!/prisma\.|tx\./.test(part)) continue;
    assert.match(part, /isolatedWhere\(/);
  }
});

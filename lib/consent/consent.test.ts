import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { goLiveBlockReason } from "../customer-copy";
import { hashEmailForMeta } from "../marketing/offline/hash";
import { hashIp } from "../marketing/ctv/quality";
import { placeIfAllowed, type VoicePort } from "../pipeline";
import { gateDecision } from "../public-routing";
import { readinessItems, type ReadinessInput } from "../readiness";
import { DEFAULT_POLICY } from "../types";
import { zonedTimeToUtc } from "../time";
import { CONSENT_COPY, CONSENT_WORDING_VERSION, draftBanner, exactWordingText, wordingHash } from "./copy";
import { consentPopupEnabled, voiceConsentGateEnabled } from "./flags";
import { consentOnboardingSelection, refuseConsentSkip } from "./onboarding";
import { OUR_TRACKING_TAGS, detectConsentSnippet, scriptWouldLoad, tagsToRelease } from "./pixels";
import { createConsentLimiter, handleConsentChoice } from "./public";
import { CONSENT_RECORD_RETENTION, effectiveLevel, latestRecord, matchKeysFromContact, type StoredChoice } from "./record";
import { consentScriptSource, consentSnippet } from "./script";
import { requiredVoiceLevel, voiceConsentDecision, voiceConsentForContactKeys, VOICE_CONSENT_DEFAULT_LEVEL } from "./voice-gate";

const ROOT = path.resolve(import.meta.dirname, "../..");

const ready: ReadinessInput = {
  testMode: false,
  scheduleEnabled: true,
  integrationsMode: "live",
  hasGhlKey: true,
  hasGhlLocation: true,
  hasElevenKey: true,
  hasElevenAgent: true,
  hasTwilioSid: true,
  hasTwilioToken: true,
  hasTwilioNumber: true,
  agentPublished: true,
  voicePublished: true,
  rulesPublished: true,
  requireConsent: true,
  enforceDnc: true,
  enforceHours: true,
  liveKnowledge: true,
  officeReady: true,
  anyTotp: true,
  webhookSecrets: true,
};

const choiceBody = {
  clientKey: "example-client",
  visitorId: "vis_example_1",
  deviceId: "dev_example_1",
  level: "high",
  action: "grant",
  pageUrl: "https://www.example.com/offer#drop-me",
  email: "person@example.com",
  wordingVersion: CONSENT_WORDING_VERSION,
};

function handler(env: Record<string, string | undefined>, body: unknown, limiter = createConsentLimiter(10)) {
  return handleConsentChoice({
    env,
    now: new Date("2026-11-02T15:36:00.000Z"),
    ip: "203.0.113.10",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    body,
    limiter,
    resolveClient: async (key) => (key === "example-client" ? { workspaceId: "ws_example", clientKey: "example-client" } : null),
  });
}

test("our tags stay blocked until a choice allows them", () => {
  assert.deepEqual(tagsToRelease(OUR_TRACKING_TAGS, null), []);
  assert.deepEqual(tagsToRelease(OUR_TRACKING_TAGS, "reject"), []);
  assert.equal(tagsToRelease(OUR_TRACKING_TAGS, "low").length, 0);
  assert.equal(tagsToRelease(OUR_TRACKING_TAGS, "medium").some((tag) => tag.kind === "analytics"), true);
  assert.equal(tagsToRelease(OUR_TRACKING_TAGS, "medium").some((tag) => tag.kind === "advertising"), false);
  assert.equal(tagsToRelease(OUR_TRACKING_TAGS, "high").some((tag) => tag.id === "audience-pixel"), true);
  assert.equal(scriptWouldLoad("https://connect.facebook.net/en_US/fbevents.js", null), false);
  assert.equal(scriptWouldLoad("https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE", "low"), false);
  assert.equal(scriptWouldLoad("https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE", "medium"), true);
  assert.equal(scriptWouldLoad("https://connect.facebook.net/en_US/fbevents.js", "medium"), false);
  assert.equal(scriptWouldLoad("/api/marketing/audiences/pixel", "high"), true);
  assert.equal(scriptWouldLoad("https://cdn.example.com/app.js", null), true);
});

test("a choice logs the exact wording version, a hashed address, and no raw contact", async () => {
  const result = await handler({ CONSENT_POPUP: "on" }, choiceBody);
  assert.equal(result.status, 200);
  assert.equal(result.record?.wordingVersionId, CONSENT_WORDING_VERSION);
  assert.equal(result.record?.wordingHash, wordingHash());
  assert.equal(result.record?.wordingText, exactWordingText());
  assert.equal(result.record?.createdAt, "2026-11-02T15:36:00.000Z");
  assert.equal(result.record?.userAgentSummary, "Chrome on Windows");
  assert.equal(result.record?.ipHash, hashIp("203.0.113.10"));
  assert.equal(result.record?.pageUrl.includes("drop-me"), false);
  assert.equal(result.record?.matchKeys.includes(`form:email:person@example.com`), true);
  assert.equal(result.record?.matchKeys.includes(`email:${hashEmailForMeta("person@example.com")}`), true);
  const stored = JSON.stringify(result.record);
  assert.equal(stored.includes("203.0.113.10"), false);
  assert.equal(stored.includes("Mozilla/5.0"), false);
  const shown = JSON.stringify(result.body).toLowerCase();
  assert.equal(shown.includes("person@example.com"), false);
  for (const word of ["spend", "bid", "cpa", "cpl", "roas", "budget"]) assert.equal(shown.includes(word), false, word);
});

test("the public choice endpoint is off and rate limited", async () => {
  const hidden = await handler({}, choiceBody);
  assert.equal(hidden.status, 404);
  assert.equal(hidden.record, undefined);
  const limiter = createConsentLimiter(2);
  const first = await handler({ CONSENT_POPUP: "on" }, choiceBody, limiter);
  const second = await handler({ CONSENT_POPUP: "on" }, choiceBody, limiter);
  const third = await handler({ CONSENT_POPUP: "on" }, choiceBody, limiter);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  const stale = await handler({ CONSENT_POPUP: "on" }, { ...choiceBody, wordingVersion: "draft-old" });
  assert.equal(stale.status, 409);
  assert.equal(stale.record, undefined);
});

test("the newest record wins, including a withdrawal", () => {
  const rows: StoredChoice[] = [
    { id: "a", createdAt: "2026-11-02T16:00:00.000Z", level: "high", action: "grant" },
    { id: "b", createdAt: "2026-11-02T14:00:00.000Z", level: "low", action: "grant" },
    { id: "c", createdAt: "2026-11-02T18:00:00.000Z", level: "medium", action: "change" },
  ];
  assert.equal(latestRecord(rows)?.id, "c");
  assert.equal(effectiveLevel(latestRecord(rows)), "medium");
  const withdrawn = [...rows, { id: "d", createdAt: "2026-11-02T19:00:00.000Z", level: "reject" as const, action: "withdraw" as const }];
  assert.equal(effectiveLevel(latestRecord(withdrawn)), "reject");
  const restored = [...withdrawn, { id: "e", createdAt: "2026-11-02T20:00:00.000Z", level: "high" as const, action: "change" as const }];
  assert.equal(effectiveLevel(latestRecord(restored)), "high");
});

test("medium or high unlocks voice, and low or none blocks it", () => {
  assert.equal(voiceConsentGateEnabled({}), false);
  assert.equal(consentPopupEnabled({}), false);
  assert.equal(consentPopupEnabled({ CONSENT_POPUP: "on" }), true);
  assert.equal(VOICE_CONSENT_DEFAULT_LEVEL, "medium");
  assert.equal(requiredVoiceLevel(null), "medium");
  assert.equal(requiredVoiceLevel("none"), "medium");
  assert.equal(requiredVoiceLevel("low"), "low");
  assert.equal(voiceConsentDecision({ enabled: false, latest: null }).allow, true);
  assert.equal(voiceConsentDecision({ enabled: true, latest: null }).allow, false);
  assert.match(voiceConsentDecision({ enabled: true, latest: null }).reason, /No recorded consent/);
  assert.equal(voiceConsentDecision({ enabled: true, latest: { level: "low", action: "grant" } }).allow, false);
  assert.match(voiceConsentDecision({ enabled: true, latest: { level: "low", action: "grant" } }).reason, /below the medium minimum/);
  assert.equal(voiceConsentDecision({ enabled: true, latest: { level: "reject", action: "grant" } }).allow, false);
  assert.equal(voiceConsentDecision({ enabled: true, latest: { level: "medium", action: "grant" } }).allow, true);
  assert.equal(voiceConsentDecision({ enabled: true, latest: { level: "high", action: "change" } }).allow, true);
  assert.equal(voiceConsentDecision({ enabled: true, latest: { level: "high", action: "withdraw" } }).allow, false);
  assert.match(voiceConsentDecision({ enabled: true, latest: { level: "medium", action: "withdraw" } }).reason, /withdrawn or rejected/);
});

test("a contact matches on any one form field, hash, click id, or CRM id", () => {
  const contactKeys = matchKeysFromContact({
    email: "person@example.com",
    phone: "+15555550123",
    ghlContactId: "ghl_example",
    gclid: "gclid_example",
    fbclid: "fbclid_example",
    gbraid: "gbraid_example",
    wbraid: "wbraid_example",
  });
  const prefixes = ["form:email:", "form:phone:", "email:", "phone:", "ghl:", "gclid:", "fbclid:", "gbraid:", "wbraid:"];
  for (const prefix of prefixes) {
    const key = contactKeys.find((item) => item.startsWith(prefix));
    assert.ok(key, prefix);
    const allowed = voiceConsentForContactKeys({
      enabled: true,
      contactKeys,
      records: [{ id: prefix, createdAt: "2026-11-02T15:00:00.000Z", level: "medium", action: "grant", matchKeys: [key!] }],
    });
    assert.equal(allowed.allow, true, prefix);
    const low = voiceConsentForContactKeys({
      enabled: true,
      contactKeys: [key!],
      records: [{ id: `${prefix}-low`, createdAt: "2026-11-02T15:00:00.000Z", level: "low", action: "grant", matchKeys: [key!] }],
    });
    assert.equal(low.allow, false, prefix);
  }
  const none = voiceConsentForContactKeys({ enabled: true, contactKeys, records: [] });
  assert.equal(none.allow, false);
  const otherPerson = voiceConsentForContactKeys({
    enabled: true,
    contactKeys: ["gclid:someone-else"],
    records: [{ id: "other", createdAt: "2026-11-02T16:00:00.000Z", level: "high", action: "grant", matchKeys: ["gclid:gclid_example"] }],
  });
  assert.equal(otherPerson.allow, false);
  const olderMatch = voiceConsentForContactKeys({
    enabled: true,
    contactKeys,
    records: [
      { id: "email", createdAt: "2026-11-02T12:00:00.000Z", level: "medium", action: "grant", matchKeys: [contactKeys.find((item) => item.startsWith("form:email:"))!] },
      { id: "other-click", createdAt: "2026-11-02T18:00:00.000Z", level: "reject", action: "grant", matchKeys: ["gclid:someone-else"] },
    ],
  });
  assert.equal(olderMatch.allow, true);
});

test("consent records are kept indefinitely and the choice log is append-only", () => {
  assert.equal(CONSENT_RECORD_RETENTION, "indefinite");
  const store = readFileSync(path.join(ROOT, "lib/consent/store.ts"), "utf8");
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.match(store, /no retention date/);
  assert.match(store, /no purge job/);
  assert.equal(store.includes("consentRecord.delete"), false);
  assert.equal(store.includes("consentRecord.update"), false);
  assert.match(schema, /Kept indefinitely/);
  assert.match(schema, /No retention date and no purge job/);
});

test("a denied voice consent check does not call the vendor", async () => {
  let called = false;
  const voice: VoicePort = {
    async placeCall() {
      called = true;
      throw new Error("should not dial");
    },
  };
  const result = await placeIfAllowed({
    gate: {
      now: zonedTimeToUtc("2026-11-02T11:00:00", "America/New_York"),
      timeZone: "America/New_York",
      consent: "high",
      onDoNotCall: false,
      dialsToday: 0,
      attemptsForContact: 0,
      policy: DEFAULT_POLICY,
    },
    voice,
    voiceInput: { to: "+15555550100", contactName: "Example Person", agentName: "Avery", openingLine: "Hello" },
    voiceConsent: { enabled: true, allow: false, reason: "Skipped voice. No recorded consent for this contact." },
  });
  assert.equal(result.kind, "blocked");
  assert.equal(result.vendorCalled, false);
  assert.equal(called, false);
  assert.match(result.checks[0]?.detail || "", /No recorded consent/);
});

test("onboarding cannot skip or uncheck the consent pop-up", () => {
  const off = consentOnboardingSelection({ enabled: false, clientKey: "example-client", origin: "https://app.example.com", websites: [] });
  assert.equal(off.items.length, 0);
  assert.equal(refuseConsentSkip({ enabled: false, action: "skip" }).ok, true);
  const websites = [
    { id: "site-a", name: "Example Dental", url: "https://www.example.com", seen: "installed" as const },
    { id: "site-b", name: "Example Roofing", url: "https://roof.example.com", seen: "none" as const },
  ];
  const on = consentOnboardingSelection({ enabled: true, clientKey: "example-client", origin: "https://app.example.com", websites });
  assert.equal(on.required, true);
  assert.equal(on.skippable, false);
  assert.equal(on.items.length, 2);
  assert.equal(on.items.every((item) => item.selected && item.locked && item.skippable === false && item.label === "Consent pop-up"), true);
  assert.equal(on.items[0]?.status, "installed");
  assert.equal(on.items[1]?.status, "missing");
  assert.equal(refuseConsentSkip({ enabled: true, action: "skip" }).ok, false);
  assert.equal(refuseConsentSkip({ enabled: true, action: "uncheck" }).ok, false);
  assert.equal(refuseConsentSkip({ enabled: true, action: "continue" }).ok, true);
  const blocked = readinessItems({ ...ready, consentPopup: { required: true, installed: false } });
  assert.equal(blocked.find((item) => item.id === "consent-popup")?.ok, false);
  assert.match(goLiveBlockReason({ confirm: "GO LIVE", items: blocked }) || "", /Finish/);
  const clear = readinessItems({ ...ready, consentPopup: { required: true, installed: true } });
  assert.equal(goLiveBlockReason({ confirm: "GO LIVE", items: clear }), null);
  assert.equal(readinessItems(ready).some((item) => item.id === "consent-popup"), false);
  const blob = JSON.stringify(on).toLowerCase();
  for (const word of ["spend", "bid", "cpa", "cpl", "roas", "budget"]) assert.equal(blob.includes(word), false, word);
});

test("the snippet is detectable, draft, and not a Concord integration", () => {
  const snippet = consentSnippet("https://app.example.com", "example-client");
  assert.match(snippet, /\/api\/public\/consent\/script\?client=example-client/);
  assert.match(snippet, /data-diver-consent-snippet/);
  assert.equal(snippet.includes("concord.tech"), false);
  assert.equal(detectConsentSnippet(snippet, "example-client"), true);
  assert.equal(detectConsentSnippet("<script src='https://cdn.example.com/app.js'></script>", "example-client"), false);
  const source = consentScriptSource({
    clientKey: "example-client",
    choiceUrl: "https://app.example.com/api/public/consent",
    installUrl: "https://app.example.com/api/public/consent/install",
  });
  assert.equal(source.includes("concord.tech"), false);
  assert.match(source, /DRAFT/);
  assert.match(source, /data-diver-held/);
  assert.match(source, /\/api\/marketing\/audiences\/pixel/);
  const dir = mkdtempSync(path.join(tmpdir(), "consent-"));
  const file = path.join(dir, "widget.js");
  writeFileSync(file, source);
  execFileSync(process.execPath, ["--check", file]);
  const prelude = snippet.match(/<script data-diver-consent-snippet="1">([\s\S]*?)<\/script>/);
  assert.ok(prelude?.[1]);
  const preludeFile = path.join(dir, "prelude.js");
  writeFileSync(preludeFile, prelude[1] || "");
  execFileSync(process.execPath, ["--check", preludeFile]);
  assert.equal(draftBanner(), "DRAFT — pending legal review");
  const preview = readFileSync(path.join(ROOT, "components/consent-draft-preview.tsx"), "utf8");
  assert.match(preview, /draftBanner/);
  assert.match(preview, /data-consent-draft/);
  for (const value of Object.values(CONSENT_COPY)) {
    if (value === CONSENT_COPY.marker) continue;
    assert.match(value, /DRAFT/);
  }
  assert.equal(gateDecision({ pathname: "/api/public/consent", signedIn: false, env: {} }).action, "next");
  assert.equal(gateDecision({ pathname: "/api/public/consent/script", signedIn: false, env: {} }).action, "next");
});

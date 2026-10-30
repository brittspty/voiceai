import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildClientShare, clientShareHasMoney } from "./client-view";
import { leadScoringEnabled } from "./config";
import { redactMarketingPage } from "./cost-visibility";
import { buildManagerDigest } from "./digest";
import { clientViewerAllowed } from "./client-gate";
import { accessFromUser } from "./access";
import { classifierFromEnv, classifyLead, modelRequest, parseModelContent } from "./lead-score/classify";
import { parseLabeledCsv, scoreLabeledRows } from "./lead-score/csv";
import { allowedLeadMarks, decideLeadMark } from "./lead-score/permissions";
import { leadScopeFor, listLeadWhere, markLeadsWhere, visibleScores, workspaceAllowed } from "./lead-score/scope";
import { markPayload, payloadHasCost, toLeadView } from "./lead-score/present";
import { scoreWithRules } from "./lead-score/rules";
import { automaticScoreText, buildLeadQualityTiles, effectiveLabel, leadQualityDigestNote, manualMarkText } from "./lead-score/summary";
import type { LeadInput } from "./lead-score/types";

const ROOT = path.resolve(import.meta.dirname, "../..");

const spamForm: LeadInput = {
  kind: "form",
  name: "Buy Now",
  phone: "+14155550101",
  email: "viagra-deals@mailinator.com",
  message: "Cheap viagra shipped overnight",
  transcript: "",
  durationSec: null,
  outcome: null,
  onDoNotCall: false,
};

const unsureForm: LeadInput = {
  kind: "form",
  name: "Pat",
  phone: "+14155550198",
  email: null,
  message: "",
  transcript: "",
  durationSec: null,
  outcome: null,
  onDoNotCall: false,
};

test("lead scoring is off unless the flag is on, and an empty key stays on rules", async () => {
  assert.equal(leadScoringEnabled({}), false);
  assert.equal(leadScoringEnabled({ MARKETING_LEAD_SCORING: "off" }), false);
  assert.equal(leadScoringEnabled({ MARKETING_LEAD_SCORING: "on" }), true);
  assert.equal(classifierFromEnv({}), null);
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  };
  const result = await classifyLead(unsureForm, { provider: classifierFromEnv({}, fetchImpl) });
  assert.equal(calls, 0);
  assert.equal(result.model, "rules");
  const envExample = readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(envExample, /MARKETING_LEAD_SCORING=off/);
  const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.match(schema, /testMode\s+Boolean\s+@default\(true\)/);
});

test("confident rules win and an unsure lead can ask the model", async () => {
  let calls = 0;
  const provider = {
    model: "test-model",
    classify: async () => {
      calls += 1;
      return { label: "qualified" as const, score: 81, reason: "Asked for an estimate" };
    },
  };
  const spam = await classifyLead(spamForm, { provider });
  assert.equal(calls, 0);
  assert.equal(spam.label, "spam");
  assert.equal(spam.model, "rules");
  const rules = scoreWithRules(unsureForm);
  assert.ok(rules.score < 80);
  const asked = await classifyLead(unsureForm, { provider });
  assert.equal(calls, 1);
  assert.equal(asked.label, "qualified");
  assert.equal(asked.model, "test-model");
  const failed = await classifyLead(unsureForm, {
    provider: {
      model: "test-model",
      classify: async () => {
        throw new Error("down");
      },
    },
  });
  assert.equal(failed.model, "rules");
  assert.equal(failed.label, rules.label);
});

test("the model request keeps the key and contact details out of the prompt", () => {
  const built = modelRequest(
    {
      ...unsureForm,
      name: "Pat Lee",
      phone: "+14155550198",
      email: "pat@example.com",
      message: "Email pat@example.com or call +14155550198",
      transcript: "This is Pat Lee at +1 (415) 555-0198",
    },
    { LEAD_SCORING_API_KEY: "sk-test-secret", LEAD_SCORING_MODEL: "demo" },
  );
  const prompt = JSON.stringify(built.body);
  assert.equal(prompt.includes("sk-test-secret"), false);
  assert.equal(prompt.includes("Pat Lee"), false);
  assert.equal(prompt.includes("14155550198"), false);
  assert.equal(prompt.includes("555-0198"), false);
  assert.equal(prompt.includes("pat@example.com"), false);
  assert.match(prompt, /\[email\]/);
  assert.match(prompt, /\[phone\]/);
  assert.equal(built.model, "demo");
  assert.deepEqual(parseModelContent('```json\n{"label":"spam","score":91,"reason":"Junk note"}\n```'), {
    label: "spam",
    score: 91,
    reason: "Junk note",
  });
  assert.equal(parseModelContent("not json"), null);
});

test("a manual mark overrides the automatic score and is described as a mark", () => {
  assert.equal(effectiveLabel({ label: "spam", overrideLabel: "qualified" }), "qualified");
  assert.equal(effectiveLabel({ label: "qualified", overrideLabel: null }), "qualified");
  const text = manualMarkText("qualified", "Alex Rivera", "Oct 29, 2026, 6:12 PM");
  assert.match(text, /Marked Qualified by Alex Rivera/);
  assert.match(text, /overrides the automatic score/);
  assert.match(automaticScoreText("qualified", 82), /Likely qualified \(82%\)/);
  const view = toLeadView({
    id: "score-1",
    label: "spam",
    score: 96,
    reason: "Message matches a spam pattern",
    model: "rules",
    overrideLabel: "qualified",
    overrideReason: "",
    overriddenAt: new Date("2026-10-29T22:00:00.000Z"),
    overriddenByName: "Alex Rivera",
    contact: { name: "Eva Ng", phone: "+19195550144", email: "eva@example.com", source: "GoHighLevel" },
    call: null,
  });
  assert.equal(view.effectiveLabel, "qualified");
  assert.equal(view.automaticLabel, "spam");
  assert.equal(view.manualBy, "Alex Rivera");
  const payload = markPayload(view);
  assert.equal(payloadHasCost(payload), false);
  assert.equal("costPerQualifiedLead" in payload, false);
});

test("the client owner can mark, and the internal owner role cannot", () => {
  const clientOwner = accessFromUser({ id: "owner", email: "alex@example.com", role: "owner" }, [], {});
  assert.equal(clientOwner.kind, "client_owner");
  assert.equal(clientOwner.seesCost, false);
  assert.deepEqual(allowedLeadMarks(clientOwner), ["qualified", "unqualified", "clear"]);
  assert.equal(decideLeadMark(clientOwner, "qualified").ok, true);
  assert.equal(decideLeadMark(clientOwner, "spam").ok, false);
  assert.equal(decideLeadMark({ role: "owner", kind: "staff" }, "qualified").ok, false);
  const elevated = accessFromUser({ id: "sa", email: "alex@example.com", role: "owner" }, [], { MARKETING_SUPER_ADMIN_EMAILS: "alex@example.com" });
  assert.equal(elevated.kind, "super_admin");
  assert.equal(decideLeadMark(elevated, "spam").ok, true);
  for (const actor of [
    { role: "super_admin", kind: "super_admin" },
    { role: "account_manager", kind: "account_manager" },
  ]) {
    assert.equal(decideLeadMark(actor, "spam").ok, true, actor.role);
    assert.equal(decideLeadMark(actor, "clear").ok, true, actor.role);
  }
  for (const actor of [
    { role: "admin", kind: "staff" },
    { role: "viewer", kind: "staff" },
    { role: "client_viewer", kind: "client_viewer" },
  ]) {
    assert.equal(decideLeadMark(actor, "qualified").ok, false, actor.role);
    assert.deepEqual(allowedLeadMarks(actor), [], actor.role);
  }
});

test("marks and qualified counts stay inside the caller workspace", () => {
  const owner = accessFromUser({ id: "owner", email: "alex@example.com", role: "owner" }, [], {});
  const manager = accessFromUser({ id: "am", email: "am@example.com", role: "account_manager" }, [{ workspaceId: "org", scopeKind: "client", adAccountId: null, campaignId: null }], {});
  const admin = accessFromUser({ id: "sa", email: "sa@example.com", role: "super_admin" }, [], {});
  const ownerScope = leadScopeFor(owner);
  const managerScope = leadScopeFor(manager);
  const adminScope = leadScopeFor(admin);
  assert.deepEqual(ownerScope, { workspaceIds: ["org"] });
  assert.deepEqual(managerScope, { workspaceIds: ["org"] });
  assert.deepEqual(adminScope, { workspaceIds: "all" });
  assert.equal(workspaceAllowed("org", ownerScope), true);
  assert.equal(workspaceAllowed("other-client", ownerScope), false);
  assert.equal(workspaceAllowed("other-client", adminScope), true);
  const rows = [
    { id: "ours", workspaceId: "org", label: "qualified" as const, overrideLabel: null },
    { id: "theirs", workspaceId: "other-client", label: "qualified" as const, overrideLabel: null },
  ];
  assert.deepEqual(visibleScores(rows, ownerScope).map((row) => row.id), ["ours"]);
  assert.deepEqual(visibleScores(rows, adminScope).map((row) => row.id), ["ours", "theirs"]);
  assert.deepEqual(markLeadsWhere(["ours", "theirs"], ownerScope), { id: { in: ["ours", "theirs"] }, workspaceId: "org" });
  assert.deepEqual(markLeadsWhere(["ours", "theirs"], adminScope), { id: { in: ["ours", "theirs"] } });
  assert.deepEqual(listLeadWhere(ownerScope), { workspaceId: "org" });
  assert.deepEqual(listLeadWhere({ workspaceIds: [] }), { workspaceId: { in: [] } });
  const store = readFileSync(path.join(ROOT, "lib/marketing/lead-score/store.ts"), "utf8");
  assert.match(store, /markLeadsWhere\(input\.ids, input\.scope\)/);
  assert.match(store, /leadsSinceWhere\(previousStart, workspaceId\)/);
  const queries = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  assert.match(queries, /leadsSince\(previousStart, workspaceId\)/);
  assert.equal(/leadsSince\(previousStart\)/.test(queries), false);
  const route = readFileSync(path.join(ROOT, "app/api/marketing/leads/mark/route.ts"), "utf8");
  assert.ok(route.indexOf("leadScopeFor(") < route.indexOf("markLeads("));
});

test("cost per qualified lead is omitted unless the viewer is allowed to see cost", () => {
  const current = [
    { label: "qualified" as const, overrideLabel: null },
    { label: "spam" as const, overrideLabel: "qualified" as const },
    { label: "unqualified" as const, overrideLabel: null },
  ];
  const hidden = buildLeadQualityTiles({
    current,
    previous: [{ label: "qualified", overrideLabel: null }],
    seesCost: false,
    spendByCurrency: [{ currency: "USD", spend: 84 }],
  });
  assert.equal(hidden.qualified, 2);
  assert.equal(hidden.rateLabel, "67%");
  assert.equal(hidden.trend, "up 1 vs last week");
  assert.equal("costPerQualifiedLead" in hidden, false);
  assert.equal(JSON.stringify(hidden).includes("$"), false);
  assert.equal(/cost|spend|cpql/i.test(JSON.stringify(hidden)), false);
  const staff = buildLeadQualityTiles({
    current,
    previous: [],
    seesCost: true,
    spendByCurrency: [{ currency: "USD", spend: 84 }],
  });
  assert.equal(staff.costPerQualifiedLead, "$42.00");
  const page = redactMarketingPage(
    {
      campaigns: [],
      rows: [],
      totals: [],
      alerts: [],
      recommendations: [],
      digests: [],
      leadQuality: staff,
    },
    false,
  );
  assert.equal("costPerQualifiedLead" in (page.leadQuality ?? {}), false);
  assert.equal(/cost|spend|\$/i.test(JSON.stringify(page.leadQuality)), false);
});

test("client and share payloads stay free of cost and of mark controls", () => {
  const view = buildClientShare({
    client: "Acme",
    adViews: 1200,
    leads: 8,
    booked: 3,
    campaigns: [{ name: "Leads", channel: "Meta", leads: 8, booked: 3 }],
    qualified: { count: 48, total: 155, delta: 6, period: "week" },
  });
  assert.equal(clientShareHasMoney(view), false);
  assert.equal(JSON.stringify(view).includes("costPerQualifiedLead"), false);
  assert.equal(JSON.stringify(view).includes("canMark"), false);
  assert.equal(view.kpis.some((row) => row.label === "Qualified leads" && row.delta === "up 6 vs last week"), true);
  assert.equal(clientViewerAllowed("/marketing/leads"), false);
  assert.equal(clientViewerAllowed("/marketing/leads/x"), false);
  assert.equal(clientViewerAllowed("/api/marketing/leads/mark"), false);
  const share = readFileSync(path.join(ROOT, "app/api/share/[token]/route.ts"), "utf8");
  assert.equal(share.includes("decideLeadMark"), false);
  assert.equal(share.includes("spendSince"), false);
  const clientRoute = readFileSync(path.join(ROOT, "app/api/marketing/client/route.ts"), "utf8");
  assert.equal(clientRoute.includes("spendSince"), false);
});

test("spend is queried only after the staff check, and marks are refused before a write", () => {
  const queries = readFileSync(path.join(ROOT, "lib/marketing/queries.ts"), "utf8");
  const tiles = queries.slice(queries.indexOf("async function leadQualityTilesFor"), queries.indexOf("export function clientRange"));
  assert.ok(tiles.indexOf("if (!seesCost)") < tiles.indexOf("spendSince("));
  const client = queries.slice(queries.indexOf("async function qualifiedForRange"));
  assert.equal(client.includes("spendSince"), false);
  const route = readFileSync(path.join(ROOT, "app/api/marketing/leads/mark/route.ts"), "utf8");
  assert.ok(route.indexOf("decideLeadMark(") < route.indexOf("leadScopeFor("));
  assert.ok(route.indexOf("leadScopeFor(") < route.indexOf("markLeads("));
  assert.match(route, /status: 403/);
  assert.equal(route.includes("spend"), false);
  assert.equal(route.includes("costPerQualifiedLead"), false);
});

test("the labeled set scores at 90 percent or better on rules alone", async () => {
  const csv = readFileSync(path.join(ROOT, "fixtures/lead-quality/labeled.csv"), "utf8");
  const rows = parseLabeledCsv(csv);
  assert.ok(rows.length >= 50);
  const report = await scoreLabeledRows(rows);
  assert.ok(report.accuracy >= 0.9, `${report.correct}/${report.total}`);
  assert.equal(report.misses.length, 0);
});

test("a do-not-call lead is not qualified even when the call books", () => {
  const result = scoreWithRules({
    kind: "call",
    name: "Morgan Lee",
    phone: "+14155550175",
    email: "morgan@gmail.com",
    message: "",
    transcript: "Yes book me tomorrow",
    durationSec: 80,
    outcome: "booked",
    onDoNotCall: true,
  });
  assert.equal(result.label, "unqualified");
  assert.match(result.reason, /do-not-call/i);
});

test("the digest can carry a waiting line and still does not send", () => {
  assert.equal(leadQualityDigestNote(0), null);
  assert.equal(leadQualityDigestNote(12), "12 leads waiting for a quality mark");
  const digest = buildManagerDigest({
    userId: "am",
    accountIds: "all",
    alerts: [],
    recommendations: [],
    notes: ["12 leads waiting for a quality mark"],
    periodStart: new Date("2026-10-29T12:00:00.000Z"),
    periodEnd: new Date("2026-10-29T13:00:00.000Z"),
    env: { MARKETING_DIGEST: "on" },
  });
  assert.equal(digest?.delivery, "not_sent");
  assert.equal(digest?.payload.notes?.[0], "12 leads waiting for a quality mark");
  assert.equal(/cost|spend|\$/i.test(JSON.stringify(digest?.payload.notes)), false);
});

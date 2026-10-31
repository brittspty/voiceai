import assert from "node:assert/strict";
import test from "node:test";
import { mockCrm, mockVoice } from "../adapters";
import { evaluateGates } from "../gates";
import { integrationsMode, portsAreMocked } from "../env";
import { DEFAULT_POLICY, type CallingPolicy } from "../types";
import { zonedTimeToUtc } from "../time";
import { areaCodeZones } from "./area-codes";
import { ais2lComplianceV2Enabled } from "./flag";
import { accountManagersToNotify, buildHandoffNotice, detectHumanHandoff, planHumanHandoff } from "./handoff";
import { callingDecision, clampCallingWindow, leadDialPlan, unknownTimezoneGate } from "./hours";
import { buildOpener, respondToCallControl } from "./opener";
import { OPT_OUT_PHRASES, detectOptOut, optOutBlocksNextDial, planOptOut } from "./opt-out";
import { isVoiceopsOutcomeTag, outcomeNote, outcomeTag, planOutcomeTags, replaceVoiceopsOutcomeTags } from "./outcomes";
import { buildCompliancePrompt } from "./prompt";
import {
  VOICEMAIL_MAX_SECONDS,
  applyVoicemailPolicy,
  capVoicemailScript,
  estimateSpeechSeconds,
  ivrResponse,
  silenceHangupSeconds,
  voicemailScript,
} from "./voicemail";

const identity = { agentName: "Avery", companyName: "Specificity Inc", reason: "you asked for a short introduction" };

function at(wall: string, zone = "America/New_York") {
  return zonedTimeToUtc(wall, zone);
}

const openGate = {
  now: at("2026-10-02T10:30:00"),
  timeZone: "America/New_York",
  consent: "high" as const,
  dialsToday: 0,
  attemptsForContact: 0,
  policy: DEFAULT_POLICY,
};

test("AIS2L_COMPLIANCE_V2 defaults off and does not turn voice live", () => {
  assert.equal(ais2lComplianceV2Enabled({}), false);
  assert.equal(ais2lComplianceV2Enabled({ AIS2L_COMPLIANCE_V2: "" }), false);
  assert.equal(ais2lComplianceV2Enabled({ AIS2L_COMPLIANCE_V2: "off" }), false);
  assert.equal(ais2lComplianceV2Enabled({ AIS2L_COMPLIANCE_V2: "on" }), true);
  assert.equal(ais2lComplianceV2Enabled({ AIS2L_COMPLIANCE_V2: "true" }), true);
  assert.equal(integrationsMode({ AIS2L_COMPLIANCE_V2: "on" }), "mock");
  assert.equal(integrationsMode({ INTEGRATIONS_MODE: "mock", AIS2L_COMPLIANCE_V2: "on" }), "mock");
  assert.equal(portsAreMocked(false, { INTEGRATIONS_MODE: "mock", AIS2L_COMPLIANCE_V2: "on" }), true);
  assert.equal(portsAreMocked(true, { INTEGRATIONS_MODE: "live", AIS2L_COMPLIANCE_V2: "on" }), true);
  assert.equal(integrationsMode({ INTEGRATIONS_MODE: "live" }), "live");
});

test("every listed opt-out phrase marks do-not-call", () => {
  for (const phrase of OPT_OUT_PHRASES) {
    const hit = detectOptOut(`Hello. ${phrase}.`);
    assert.equal(hit.matched, true, phrase);
  }
});

test("fuzzy opt-out phrasing matches, and ordinary speech does not", () => {
  assert.equal(detectOptOut("yeah please stop caling me").matched, true);
  assert.equal(detectOptOut("can you take me of your list").matched, true);
  assert.equal(detectOptOut("just remov me").matched, true);
  assert.equal(detectOptOut("dontcall again").matched, true);
  assert.equal(detectOptOut("I was calling about my appointment yesterday").matched, false);
  assert.equal(detectOptOut("I do not care about that offer").matched, false);
  assert.equal(detectOptOut("take me to the office").matched, false);
});

test("an opt-out plan suppresses the next dial", () => {
  const plan = planOptOut({ phone: "+12125550100", phrase: "stop calling" });
  assert.equal(plan.doNotCall, true);
  assert.equal(plan.suppressFutureDials, true);
  assert.equal(plan.source, "ais2l");
  const blocked = optOutBlocksNextDial(openGate, plan);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.checks.find((check) => check.id === "dnc")?.passed, false);
  const clear = evaluateGates({ ...openGate, onDoNotCall: false });
  assert.equal(clear.checks.find((check) => check.id === "dnc")?.passed, true);
});

test("outcome tags replace the previous voiceops outcome and keep the call times", async () => {
  const existing = ["customer", "voiceops-booked", "voiceops-voicemail", "do-not-call"];
  const plan = planOutcomeTags(existing, "not_interested");
  assert.deepEqual(plan.remove, ["voiceops-booked", "voiceops-voicemail"]);
  assert.deepEqual(plan.add, ["voiceops-not-interested"]);
  assert.equal(isVoiceopsOutcomeTag("customer"), false);
  assert.equal(isVoiceopsOutcomeTag(outcomeTag("booked")), true);

  const again = planOutcomeTags(["voiceops-not-interested", "customer"], "not_interested", ["do-not-call"]);
  assert.deepEqual(again.remove, []);
  assert.deepEqual(again.add, ["do-not-call"]);

  const calls: string[] = [];
  let tags = ["customer", "voiceops-booked", "voiceops-failed"];
  const replaced = await replaceVoiceopsOutcomeTags(
    {
      async listTags() {
        calls.push("list");
        return tags;
      },
      async removeTags(_id, remove) {
        calls.push(`remove:${remove.join(",")}`);
        tags = tags.filter((tag) => !remove.includes(tag));
      },
      async addTags(_id, add) {
        calls.push(`add:${add.join(",")}`);
        tags = [...tags, ...add];
      },
    },
    "contact_1",
    "callback_requested",
    ["do-not-call"],
  );
  assert.deepEqual(calls, ["list", "remove:voiceops-booked,voiceops-failed", "add:voiceops-callback-requested,do-not-call"]);
  assert.deepEqual(replaced.remove, ["voiceops-booked", "voiceops-failed"]);
  assert.deepEqual(tags, ["customer", "voiceops-callback-requested", "do-not-call"]);

  const dialed = new Date("2026-10-02T14:00:00.000Z");
  const started = new Date("2026-10-02T14:00:05.000Z");
  const ended = new Date("2026-10-02T14:01:00.000Z");
  const note = outcomeNote({ agentName: "Avery", outcome: "callback_requested", durationSec: 55, dialedAt: dialed, startedAt: started, endedAt: ended, doNotCall: true });
  assert.match(note, /Dialed 2026-10-02T14:00:00.000Z/);
  assert.match(note, /Started 2026-10-02T14:00:05.000Z/);
  assert.match(note, /Ended 2026-10-02T14:01:00.000Z/);
  assert.match(note, /Marked do-not-call/);

  const written = await mockCrm.writeOutcome({
    contactName: "Ada",
    phone: "+12125550199",
    outcome: "not_interested",
    durationSec: 30,
    agentName: "Avery",
    summary: note,
    replaceOutcomeTags: true,
    existingTags: ["voiceops-booked", "customer"],
    alsoAddTags: ["do-not-call"],
  });
  assert.deepEqual(written.removedTags, ["voiceops-booked"]);
  assert.deepEqual(written.addedTags, ["voiceops-not-interested", "do-not-call"]);
});

test("a contact gets at most one 20-second voicemail, then silence and menus hang up", () => {
  assert.equal(silenceHangupSeconds({}), 12);
  assert.equal(silenceHangupSeconds({ AIS2L_SILENCE_HANGUP_SEC: "9" }), 10);
  assert.equal(silenceHangupSeconds({ AIS2L_SILENCE_HANGUP_SEC: "10" }), 10);
  assert.equal(silenceHangupSeconds({ AIS2L_SILENCE_HANGUP_SEC: "15" }), 15);
  assert.equal(silenceHangupSeconds({ AIS2L_SILENCE_HANGUP_SEC: "18" }), 15);
  assert.equal(silenceHangupSeconds({ AIS2L_SILENCE_HANGUP_SEC: "nope" }), 12);

  const first = applyVoicemailPolicy({ outcome: "voicemail", durationSec: 45, priorVoicemails: 0, silenceLimitSec: 12 });
  assert.equal(first.action, "leave");
  assert.equal(first.outcome, "voicemail");
  assert.equal(first.durationSec, VOICEMAIL_MAX_SECONDS);
  assert.equal(first.navigate, false);
  assert.equal(first.dtmf, null);

  const second = applyVoicemailPolicy({ outcome: "voicemail", durationSec: 18, priorVoicemails: 1, silenceLimitSec: 12 });
  assert.equal(second.action, "hangup");
  assert.equal(second.reason, "already_left");
  assert.equal(second.outcome, "no_answer");
  assert.equal(second.durationSec, 0);

  const quiet = applyVoicemailPolicy({ outcome: "no_answer", durationSec: 14, priorVoicemails: 0, silenceSec: 9, silenceLimitSec: 10 });
  assert.equal(quiet.action, "unchanged");
  const silent = applyVoicemailPolicy({ outcome: "voicemail", durationSec: 30, priorVoicemails: 0, silenceSec: 10, silenceLimitSec: 10 });
  assert.equal(silent.action, "hangup");
  assert.equal(silent.reason, "silence");
  assert.equal(silent.outcome, "no_answer");

  const ivr = applyVoicemailPolicy({
    outcome: "voicemail",
    durationSec: 40,
    priorVoicemails: 0,
    silenceLimitSec: 12,
    contactLines: ["Press 1 for sales. Press 2 for support."],
  });
  assert.equal(ivr.action, "hangup");
  assert.equal(ivr.reason, "ivr");
  assert.equal(ivr.dtmf, null);
  assert.equal(ivr.navigate, false);

  const menu = applyVoicemailPolicy({
    outcome: "voicemail",
    durationSec: 25,
    priorVoicemails: 0,
    silenceLimitSec: 12,
    contactLines: ["Voicemail menu. To delete this message, wait."],
  });
  assert.equal(menu.action, "hangup");
  assert.equal(menu.reason, "menu");
  assert.equal(menu.dtmf, null);

  const keys = ivrResponse();
  assert.equal(keys.dtmf, null);
  assert.equal(keys.navigate, false);
  assert.equal(keys.action, "hangup");

  const script = voicemailScript(identity);
  assert.ok(script.seconds <= VOICEMAIL_MAX_SECONDS);
  assert.ok(script.seconds > 0);
  const long = capVoicemailScript(Array.from({ length: 80 }, () => "hello").join(" "));
  assert.equal(long.capped, true);
  assert.ok(long.seconds <= VOICEMAIL_MAX_SECONDS);
  assert.ok(estimateSpeechSeconds(long.text) <= VOICEMAIL_MAX_SECONDS);
});

test("the opener states the name and reason first, and screening gets both", () => {
  const opener = buildOpener(identity);
  assert.equal(opener.includes("?"), false);
  assert.ok(opener.startsWith("Hi, this is Avery with Specificity Inc."));
  assert.ok(opener.includes("I'm calling because you asked for a short introduction."));
  assert.ok(opener.indexOf("Avery") < opener.indexOf("you asked for a short introduction"));

  const screening = respondToCallControl("Who is calling, and what is this regarding?", identity);
  assert.equal(screening.kind, "screening");
  if (screening.kind === "screening") {
    assert.match(screening.say, /Avery/);
    assert.match(screening.say, /Specificity Inc/);
    assert.match(screening.say, /you asked for a short introduction/);
    assert.equal(screening.hangup, false);
  }

  const hold = respondToCallControl("Can you hold on a minute?", identity);
  assert.equal(hold.kind, "hold");
  if (hold.kind === "hold") {
    assert.equal(hold.hangup, false);
    assert.equal(hold.say.includes("?"), false);
  }

  const transfer = respondToCallControl("Let me transfer you to the desk.", identity);
  assert.equal(transfer.kind, "transfer");
  if (transfer.kind === "transfer") {
    assert.match(transfer.say, /Avery/);
    assert.match(transfer.say, /you asked for a short introduction/);
    assert.equal(transfer.hangup, false);
  }

  assert.equal(respondToCallControl("Yes, tomorrow morning works.", identity).kind, "none");

  const prompt = buildCompliancePrompt({ ...identity, silenceSec: 12, voicemailAllowed: true });
  assert.match(prompt, /Avery/);
  assert.match(prompt, /you asked for a short introduction/);
  assert.match(prompt, /before any question/);
  assert.match(prompt, /hold/i);
  assert.match(prompt, /transfer/i);
  assert.match(prompt, /screener/i);
  assert.match(prompt, /20 seconds/);
  assert.match(prompt, /12 seconds/);
  assert.match(prompt, /Never press a key/);
});

test("the mock voice opens with the name and reason when compliance is on", async () => {
  const openingLine = buildOpener(identity);
  const result = await mockVoice.placeCall({
    to: "+12125550100",
    contactName: "Ada Lovelace",
    agentName: "Avery",
    companyName: "Specificity Inc",
    openingLine,
    compliancePrompt: buildCompliancePrompt({ ...identity, silenceSec: 12, voicemailAllowed: false }),
    simulatedOutcome: "callback_requested",
  });
  assert.equal(result.transcript[0]?.text, openingLine);
  const mailbox = await mockVoice.placeCall({
    to: "+12125550100",
    contactName: "Ada Lovelace",
    agentName: "Avery",
    companyName: "Specificity Inc",
    openingLine,
    compliancePrompt: "compliance",
    simulatedOutcome: "voicemail",
  });
  assert.ok(estimateSpeechSeconds(mailbox.transcript[0]?.text || "") <= VOICEMAIL_MAX_SECONDS);
});

test("calls dial only from 9 AM to 8 PM in the lead zone, and an unknown zone is queued", () => {
  const zones = areaCodeZones();
  assert.equal(zones["212"], "America/New_York");
  assert.equal(zones["919"], "America/New_York");
  assert.equal(zones["312"], "America/Chicago");
  assert.equal(zones["303"], "America/Denver");
  assert.equal(zones["480"], "America/Phoenix");
  assert.equal(zones["310"], "America/Los_Angeles");
  assert.equal(zones["808"], "Pacific/Honolulu");
  assert.equal(zones["907"], "America/Anchorage");
  assert.equal(zones["800"], undefined);

  const policy: CallingPolicy = { ...DEFAULT_POLICY, windowStart: "08:00", windowEnd: "21:00" };
  const morning = callingDecision({
    now: at("2026-10-02T08:30:00"),
    phone: "+12125550100",
    addressTimezone: "America/New_York",
    officeTimezones: ["America/Chicago"],
    policy,
  });
  assert.equal(morning.action, "dial");
  if (morning.action === "dial") {
    assert.equal(morning.insideHours, false);
    assert.equal(morning.policy.windowStart, "09:00");
    assert.equal(morning.policy.windowEnd, "20:00");
    assert.equal(morning.source, "address");
  }

  const open = callingDecision({
    now: at("2026-10-02T09:00:00"),
    phone: "+12125550100",
    addressTimezone: "America/New_York",
    officeTimezones: ["America/Chicago"],
    policy: DEFAULT_POLICY,
  });
  assert.equal(open.action, "dial");
  if (open.action === "dial") {
    assert.equal(open.insideHours, true);
    const gate = evaluateGates({ ...openGate, now: at("2026-10-02T09:00:00"), timeZone: open.timeZone, policy: open.policy });
    assert.equal(gate.checks.find((check) => check.id === "hours")?.passed, true);
  }

  const eight = callingDecision({
    now: at("2026-10-02T20:00:00"),
    phone: "+12125550100",
    addressTimezone: "America/New_York",
    officeTimezones: ["America/Chicago"],
    policy: DEFAULT_POLICY,
  });
  assert.equal(eight.action, "dial");
  if (eight.action === "dial") {
    assert.equal(eight.insideHours, false);
    const gate = evaluateGates({ ...openGate, now: at("2026-10-02T20:00:00"), timeZone: eight.timeZone, policy: eight.policy });
    assert.equal(gate.checks.find((check) => check.id === "hours")?.passed, false);
  }

  const evening = callingDecision({
    now: at("2026-10-02T19:59:00"),
    phone: "+12125550100",
    addressTimezone: "America/New_York",
    officeTimezones: ["America/Chicago"],
    policy: DEFAULT_POLICY,
  });
  assert.equal(evening.action, "dial");
  if (evening.action === "dial") assert.equal(evening.insideHours, true);

  const address = callingDecision({
    now: at("2026-10-02T10:00:00"),
    phone: "+12125550100",
    addressTimezone: "America/Los_Angeles",
    officeTimezones: ["America/New_York"],
    policy: DEFAULT_POLICY,
  });
  assert.equal(address.action, "dial");
  if (address.action === "dial") {
    assert.equal(address.timeZone, "America/Los_Angeles");
    assert.equal(address.source, "address");
    assert.equal(address.insideHours, false);
  }

  const fromPhone = callingDecision({
    now: at("2026-10-02T10:00:00"),
    phone: "+13125550100",
    addressTimezone: "America/New_York",
    officeTimezones: ["America/New_York"],
    policy: DEFAULT_POLICY,
  });
  assert.equal(fromPhone.action, "dial");
  if (fromPhone.action === "dial") {
    assert.equal(fromPhone.source, "area_code");
    assert.equal(fromPhone.timeZone, "America/Chicago");
    assert.equal(fromPhone.insideHours, true);
  }

  const unknown = callingDecision({
    now: at("2026-10-02T10:00:00"),
    phone: "+18005550100",
    addressTimezone: "America/New_York",
    officeTimezones: ["America/New_York"],
    policy: DEFAULT_POLICY,
  });
  assert.equal(unknown.action, "queue");
  if (unknown.action === "queue") {
    assert.equal(unknown.reason, "unknown_timezone");
    assert.equal(unknown.runAt.getTime() - at("2026-10-02T10:00:00").getTime(), 6 * 60 * 60 * 1000);
  }
  const queued = unknownTimezoneGate(evaluateGates({ ...openGate, onDoNotCall: false }));
  assert.equal(queued.passed, false);
  assert.match(queued.checks.find((check) => check.id === "hours")?.detail || "", /unknown/i);

  const narrow = clampCallingWindow({ ...DEFAULT_POLICY, windowStart: "10:00", windowEnd: "17:00" });
  assert.equal(narrow.windowStart, "10:00");
  assert.equal(narrow.windowEnd, "17:00");
  const empty = clampCallingWindow({ ...DEFAULT_POLICY, windowStart: "21:00", windowEnd: "22:00" });
  assert.deepEqual(empty.days, []);

  assert.deepEqual(leadDialPlan({ enabled: false, now: at("2026-10-02T10:00:00"), phone: "+18005550100", policy: DEFAULT_POLICY }), { enabled: false });
});

test("an objection to the AI or a request for a person stops the AI and notifies the assigned manager", () => {
  assert.equal(detectHumanHandoff("Are you a robot? I don't want to talk to AI.").matched, true);
  const advisor = detectHumanHandoff("Can I speak with my advisor?");
  assert.equal(advisor.matched, true);
  if (advisor.matched) assert.equal(advisor.reason, "advisor");
  const human = detectHumanHandoff("Please get me a humen");
  assert.equal(human.matched, true);
  if (human.matched) assert.equal(human.reason, "human");
  assert.equal(detectHumanHandoff("Tomorrow morning works for me.").matched, false);

  const managers = [
    { id: "mgr_a", name: "Jordan Lee", email: "jordan@example.com" },
    { id: "mgr_b", name: "Sam Patel", email: "sam@example.com" },
  ];
  assert.deepEqual(
    accountManagersToNotify({ managers, assignedManagerId: "mgr_b" }).map((manager) => manager.id),
    ["mgr_b"],
  );
  assert.equal(detectHumanHandoff("stop the ai").matched, true);
  const hit = detectHumanHandoff("I want a real person");
  assert.equal(hit.matched, true);
  if (!hit.matched) return;
  const plan = planHumanHandoff({
    contactName: "Ada Lovelace",
    phone: "+12125550100",
    hit,
    managers,
    assignedManagerId: "mgr_b",
  });
  assert.equal(plan.stopAi, true);
  assert.equal(plan.flag, "human_takeover");
  assert.equal(plan.notices.length, 1);
  assert.equal(plan.notices[0]?.toName, "Sam Patel");
  assert.equal(plan.notices[0]?.toEmail, "sam@example.com");
  assert.match(plan.notices[0]?.body || "", /Ada Lovelace/);
  assert.match(plan.notices[0]?.body || "", /AI stopped/);
  assert.equal(plan.notices[0]?.stopAi, true);

  const unassigned = planHumanHandoff({ contactName: "Ada Lovelace", phone: "+12125550100", hit, managers: [] });
  assert.equal(unassigned.notices[0]?.toName, "Account manager");
  assert.equal(unassigned.notices[0]?.toEmail, null);
  const notice = buildHandoffNotice({
    contactName: "Ada Lovelace",
    phone: "+12125550100",
    reason: "ai_objection",
    phrase: "are you a robot",
    managerName: "Jordan Lee",
    managerEmail: "jordan@example.com",
  });
  assert.match(notice.subject, /Ada Lovelace/);
  assert.match(notice.body, /objected to the AI/);
});

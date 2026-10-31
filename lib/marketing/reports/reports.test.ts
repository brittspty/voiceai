import assert from "node:assert/strict";
import test from "node:test";
import { BRAND_TAGLINE, BRAND_WORDMARK } from "../../brand";
import { forbiddenClientKeys } from "../client-view";
import { reportsV2Enabled } from "../config";
import { defaultShareExpiry, shareExpiryForDays, shareHttpStatus, shareLinkState, SHARE_LINK_DEFAULT_MS } from "../share-link";
import { exampleReportSource } from "./example-source";
import { formatUpdatedEt } from "./format";
import { clearReportCache, loadStaffReport, reportForRequester } from "./load";
import { easeOutCubic, REPORT_MOTION, shouldAnimate } from "./motion";
import { buildReportPdf } from "./pdf";
import { reportFooterLine } from "./brand";
import { registerReportSource, selectReportSource } from "./source";
import { reopenClientReport, reportPayloadHasCost, reportPdfLines, sealClientReport, REPORT_COST_TEXT } from "../client-view";
import type { ReportMetricsSource, StaffReport } from "./types";

const COST = REPORT_COST_TEXT;

test("JARVIS_REPORTS_V2 defaults off", () => {
  assert.equal(reportsV2Enabled({}), false);
  assert.equal(reportsV2Enabled({ JARVIS_REPORTS_V2: "off" }), false);
  assert.equal(reportsV2Enabled({ JARVIS_REPORTS_V2: "on" }), true);
  assert.equal(reportsV2Enabled({ JARVIS_REPORTS_V2: "1" }), true);
});

test("motion timings and the reduced-motion fallback", () => {
  assert.equal(REPORT_MOTION.countUpMs, 900);
  assert.equal(REPORT_MOTION.drawInMs, 600);
  assert.equal(REPORT_MOTION.tooltipInMs, 120);
  assert.equal(REPORT_MOTION.tooltipOutMs, 80);
  assert.equal(REPORT_MOTION.seriesMorphMs, 300);
  assert.equal(REPORT_MOTION.pollMs, 60_000);
  assert.equal(REPORT_MOTION.cacheMs, 5 * 60_000);
  assert.equal(REPORT_MOTION.staleMs, 6 * 60 * 60_000);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
  assert.equal(shouldAnimate(true), false);
  assert.equal(shouldAnimate(false), true);
});

test("the footer uses the brand name and tagline", () => {
  const footer = reportFooterLine();
  assert.match(footer, new RegExp(BRAND_WORDMARK));
  assert.match(footer, new RegExp(BRAND_TAGLINE.replace(/\./g, "\\.")));
  assert.equal(footer.includes("Be Found"), false);
  assert.equal(footer.includes("Okara"), false);
});

test("share expiry stays 30 days unless 7 or 90 is chosen", () => {
  const now = new Date("2026-10-31T01:46:00.000Z");
  assert.equal(shareExpiryForDays(30, now).getTime() - now.getTime(), SHARE_LINK_DEFAULT_MS);
  assert.equal(shareExpiryForDays(30, now).getTime(), defaultShareExpiry(now).getTime());
  assert.equal(shareExpiryForDays(7, now).getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(shareExpiryForDays(90, now).getTime() - now.getTime(), 90 * 24 * 60 * 60 * 1000);
  assert.equal(shareExpiryForDays(14, now).getTime(), shareExpiryForDays(30, now).getTime());
});

test("a revoked report link is 410 and a missing link stays 404", () => {
  assert.equal(shareHttpStatus("revoked", true), 410);
  assert.equal(shareHttpStatus("revoked", false), 404);
  assert.equal(shareHttpStatus("ok", true), 200);
  assert.equal(shareHttpStatus("expired", true), 404);
  const link = {
    id: "1",
    workspaceId: "org",
    tokenHash: "h",
    label: "",
    createdById: "u",
    expiresAt: null,
    revokedAt: null,
  };
  assert.equal(shareLinkState(link, new Date(), { JARVIS_REPORTS_V2: "on" }), "ok");
  assert.equal(shareLinkState({ ...link, revokedAt: new Date() }, new Date(), { JARVIS_REPORTS_V2: "on" }), "revoked");
});

test("reports read the example source until a cross-channel source is registered", async () => {
  registerReportSource(null);
  clearReportCache();
  const first = await selectReportSource();
  assert.equal(first.id, "example");
  let calls = 0;
  const fake: ReportMetricsSource = {
    id: "cross-channel",
    available: () => true,
    async load(query) {
      calls += 1;
      const base = await exampleReportSource.load(query);
      return { ...base, sourceId: "cross-channel", headline: "From the metric model" };
    },
  };
  registerReportSource(fake);
  clearReportCache();
  const picked = await selectReportSource();
  assert.equal(picked.id, "cross-channel");
  const loaded = await loadStaffReport({ range: "30d", compare: "prior", clientId: "all" }, 1_000);
  const again = await loadStaffReport({ range: "30d", compare: "prior", clientId: "all" }, 1_000 + 60_000);
  assert.equal(calls, 1);
  assert.equal(again.headline, loaded.headline);
  const later = await loadStaffReport({ range: "30d", compare: "prior", clientId: "all" }, 1_000 + REPORT_MOTION.cacheMs);
  assert.equal(calls, 2);
  assert.equal(later.sourceId, "cross-channel");
  registerReportSource(null);
  clearReportCache();
});

test("client reports, pdf text, and reopened snapshots contain no cost fields", async () => {
  for (const clientId of ["all", "harbor"]) {
    const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId });
    assert.equal(reportPayloadHasCost(staff), true, `${clientId} staff fixture should still carry cost for staff`);
    const client = sealClientReport(staff);
    assert.equal(client.audience, "client");
    assert.equal(reportPayloadHasCost(client), false, clientId);
    assert.deepEqual(forbiddenClientKeys(client), []);
    assert.equal(COST.test(reportPdfLines(client).join("\n")), false, clientId);
    const pdf = buildReportPdf(client).toString("latin1");
    assert.equal(COST.test(pdf), false, `${clientId} pdf`);
    assert.match(pdf, /qualified leads/i);
    assert.equal(pdf.includes("%%EOF"), true);
    const poisoned = {
      ...client,
      cpl: 44,
      note: "CPL $44 and ROAS 4",
      nested: { spend: 10, budget: 2, label: "cost per lead $" },
    };
    const reopened = reopenClientReport(poisoned);
    assert.equal(reportPayloadHasCost(reopened), false);
    assert.equal(JSON.stringify(reopened).includes("$"), false);
    assert.equal(JSON.stringify(reopened).toLowerCase().includes("roas"), false);
  }
});

test("a client requester cannot receive a staff report", async () => {
  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "harbor" });
  const forced = reportForRequester(staff, { seesCost: false, view: "staff" });
  const chosen = reportForRequester(staff, { seesCost: true, view: "client" });
  const kept = reportForRequester(staff, { seesCost: true, view: "staff" });
  assert.equal(forced.audience, "client");
  assert.equal(chosen.audience, "client");
  assert.equal(kept.audience, "staff");
  assert.equal(reportPayloadHasCost(forced), false);
  assert.equal(reportPayloadHasCost(chosen), false);
  assert.equal(COST.test(buildReportPdf(forced).toString("latin1")), false);
  assert.equal(COST.test(buildReportPdf(kept).toString("latin1")), true);
});

test("the harbor client report matches the client story and keeps a pinned note", async () => {
  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "harbor" });
  const client = sealClientReport(staff);
  assert.match(client.headline, /Harbor Dental/);
  assert.match(client.headline, /48 qualified leads/);
  assert.equal(client.kpis[0]?.why?.includes("emergency dentist"), true);
  assert.equal(client.kpis.some((kpi) => kpi.format === "currency" || kpi.format === "multiple"), false);
  assert.equal(client.series.some((item) => item.id === "cpql"), false);
  assert.equal(client.defaultSeriesId, "visits");
  assert.equal(client.annotations.length > 0, true);
  assert.match(client.annotations[0]?.body || "", /40 to 60/);
  assert.equal(client.channels.some((row) => "cpl" in row), false);
  assert.match(client.channels[0]?.name || "", /Facebook/);
  const week = await exampleReportSource.load({ range: "7d", compare: "none", clientId: "harbor" });
  assert.equal(week.series[0]?.points.length, 7);
  assert.equal(week.compare, "none");
});

test("freshness marks a tile stale after 6 hours", () => {
  const now = new Date("2026-10-31T21:46:00.000Z");
  const fresh = formatUpdatedEt("2026-11-01T01:46:00.000Z", new Date("2026-11-01T01:50:00.000Z"));
  assert.equal(fresh.stale, false);
  assert.match(fresh.text, /9:46 PM ET/);
  const stale = formatUpdatedEt(new Date(now.getTime() - 7 * 60 * 60 * 1000).toISOString(), now);
  assert.equal(stale.stale, true);
  assert.match(stale.text, /Updated \d+h ago/);
});

test("a cost sentence on a client tile is dropped before the snapshot is sealed", async () => {
  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "harbor" });
  const dirty: StaffReport = {
    ...staff,
    clientKpis: staff.clientKpis.map((kpi, index) => (index === 0 ? { ...kpi, why: "CPL fell to $92 after the change." } : kpi)),
  };
  const client = sealClientReport(dirty);
  assert.equal(client.kpis[0]?.why, undefined);
  assert.equal(reportPayloadHasCost(client), false);
});

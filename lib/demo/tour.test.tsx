import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoScreens } from "../../components/demo-screens";
import { DEMO_FACTS } from "./dataset";
import { buildDemoDataset } from "./dataset";
import { presentDemo } from "./present";
import {
  HUMANS_CONTROL_BUDGETS,
  ILLUSTRATIVE_BADGE,
  TOUR_COPY_STATUS,
  TOUR_EXIT_CLASS,
  moveTour,
  parseTourEnding,
  renderTourSteps,
  tourActive,
  tourCatalog,
  tourKey,
  tourLocation,
  tourStepIndex,
} from "./tour";

const CORE_IDS = ["problem", "audience", "serving", "segments", "verified", "compare", "explanations", "decisions", "vendors", "report"];

test("tour steps deep-link, branch, and navigate", () => {
  const open = renderTourSteps(DEMO_FACTS);
  const client = renderTourSteps(DEMO_FACTS, "client");
  const investor = renderTourSteps(DEMO_FACTS, "investor");
  assert.equal(TOUR_COPY_STATUS, "DRAFT");
  assert.equal(open.length, 11);
  assert.deepEqual(open.slice(0, 10).map((step) => step.id), CORE_IDS);
  assert.equal(open.at(-1)?.id, "close");
  assert.equal(client.at(-1)?.id, "client");
  assert.equal(investor.at(-1)?.id, "investor");
  assert.deepEqual(client.slice(0, 10).map((step) => step.href), open.slice(0, 10).map((step) => step.href));
  assert.equal(new Set(open.map((step) => step.href)).size, open.length);
  assert.equal(tourStepIndex("1", open.length), 0);
  assert.equal(tourStepIndex("11", open.length), 10);
  assert.equal(tourStepIndex("12", open.length), 0);
  assert.equal(moveTour(0, -1, open.length), 0);
  assert.equal(moveTour(10, 1, open.length), 10);
  const segments = open.findIndex((step) => step.id === "segments");
  assert.equal(tourLocation(open[segments]!, "self", "client", segments), "/demo/segments?tour=self&step=4&view=client");
  const investorStep = investor.at(-1)!;
  assert.equal(
    tourLocation(investorStep, "present", "staff", investor.length - 1, "investor"),
    "/demo/investor?tour=present&step=11&view=staff&ending=investor",
  );
  assert.equal(parseTourEnding("client"), "client");
  assert.equal(parseTourEnding("nope"), null);
  assert.equal(tourKey("ArrowRight", "present"), "next");
  assert.equal(tourKey("ArrowLeft", "present"), "back");
  assert.equal(tourKey("ArrowRight", "self"), null);
  assert.equal(tourKey("Escape", "self"), "exit");
  assert.equal(tourActive(false, "present"), false);
  assert.equal(tourActive(true, null), false);
  assert.equal(TOUR_EXIT_CLASS.includes("fixed"), false);
  assert.match(TOUR_EXIT_CLASS, /relative/);
  assert.match(HUMANS_CONTROL_BUDGETS, /Humans control budgets/);
  assert.equal(tourCatalog(DEMO_FACTS).client.length, client.length);
});

test("the compare step has no figures and the compare screen only shows the badge", () => {
  const steps = renderTourSteps(DEMO_FACTS);
  const step = steps.find((item) => item.id === "compare");
  assert.ok(step);
  assert.equal(step?.showsFigures, false);
  assert.equal(/\d/.test(step?.body || "1"), false);
  assert.equal(/\d/.test(step?.title || "1"), false);
  assert.equal(ILLUSTRATIVE_BADGE, "ILLUSTRATIVE DEMO DATA");
  const html = renderToStaticMarkup(<DemoScreens screen="compare" data={presentDemo(buildDemoDataset(), "staff")} tourEnabled={false} />);
  const section = html.slice(html.indexOf('data-tour-anchor="compare"')).replace(/<[^>]+>/g, " ");
  assert.match(section, /ILLUSTRATIVE DEMO DATA/);
  assert.equal(/\d/.test(section), false);
});

test("talking points cite research on the problem step and keep the product lines", () => {
  const open = renderTourSteps(DEMO_FACTS);
  const text = open.map((step) => `${step.title} ${step.body}`).join("\n");
  const problem = open[0];
  assert.equal(problem?.id, "problem");
  assert.match(problem?.body || "", /53%/);
  assert.match(problem?.body || "", /Thales/);
  assert.match(problem?.body || "", /Pixalate/);
  assert.match(problem?.body || "", /45\.1%/);
  assert.match(problem?.body || "", /DoubleVerify/);
  assert.match(problem?.body || "", /not a Specificity result/);
  const audience = open.find((step) => step.id === "audience");
  assert.match(audience?.body || "", /48/);
  assert.match(audience?.body || "", /80/);
  assert.match(text, /Your audience\. Everywhere\./);
  assert.match(text, /Bots optimize, humans make the call/);
  assert.equal(text.includes("Your Buyer Audience; Everywhere"), false);
  assert.match(text, /Humans control budgets/);
  assert.equal(/Jarvis|Diver AI|Totaligent|Performance Max|Advantage\+|Madgicx/i.test(text), false);
  const investor = renderTourSteps(DEMO_FACTS, "investor").at(-1);
  assert.match(investor?.body || "", /\$294\.6B/);
  assert.match(investor?.body || "", /\[Specificity figure\]/);
  assert.match(investor?.body || "", /does not promise a return/);
  assert.match(investor?.body || "", /counsel review/);
});

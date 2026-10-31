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
  renderTourSteps,
  tourActive,
  tourKey,
  tourLocation,
  tourStepIndex,
} from "./tour";

test("tour steps deep-link and navigate", () => {
  const steps = renderTourSteps(DEMO_FACTS);
  assert.equal(TOUR_COPY_STATUS, "DRAFT");
  assert.equal(steps.length, 8);
  assert.deepEqual(
    steps.map((step) => step.href),
    ["/demo", "/demo/audiences", "/demo/serving", "/demo/segments", "/demo/compare", "/demo/explanations", "/demo/decisions", "/demo/report"],
  );
  assert.equal(new Set(steps.map((step) => step.href)).size, 8);
  assert.equal(tourStepIndex("1", steps.length), 0);
  assert.equal(tourStepIndex("8", steps.length), 7);
  assert.equal(tourStepIndex("9", steps.length), 0);
  assert.equal(moveTour(0, -1, steps.length), 0);
  assert.equal(moveTour(7, 1, steps.length), 7);
  assert.equal(moveTour(2, 1, steps.length), 3);
  assert.equal(tourLocation(steps[3]!, "self", "client", 3), "/demo/segments?tour=self&step=4&view=client");
  assert.equal(tourKey("ArrowRight", "present"), "next");
  assert.equal(tourKey("ArrowLeft", "present"), "back");
  assert.equal(tourKey("ArrowRight", "self"), null);
  assert.equal(tourKey("Escape", "self"), "exit");
  assert.equal(tourActive(false, "present"), false);
  assert.equal(tourActive(true, null), false);
  assert.equal(TOUR_EXIT_CLASS.includes("fixed"), false);
  assert.match(TOUR_EXIT_CLASS, /relative/);
  assert.match(HUMANS_CONTROL_BUDGETS, /Humans control budgets/);
});

test("step 5 has no figures and the compare screen only shows the badge", () => {
  const steps = renderTourSteps(DEMO_FACTS);
  const step = steps[4];
  assert.equal(step?.id, "compare");
  assert.equal(step?.showsFigures, false);
  assert.equal(/\d/.test(step?.body || "1"), false);
  assert.equal(/\d/.test(step?.title || "1"), false);
  assert.equal(ILLUSTRATIVE_BADGE, "ILLUSTRATIVE DEMO DATA");
  const html = renderToStaticMarkup(<DemoScreens screen="compare" data={presentDemo(buildDemoDataset(), "staff")} tourEnabled={false} />);
  const section = html.slice(html.indexOf('data-tour-anchor="compare"')).replace(/<[^>]+>/g, " ");
  assert.match(section, /ILLUSTRATIVE DEMO DATA/);
  assert.equal(/\d/.test(section), false);
});

test("talking points stay placeholder copy without industry statistics", () => {
  const text = renderTourSteps(DEMO_FACTS).map((step) => `${step.title} ${step.body}`).join("\n");
  assert.match(text, /PLACEHOLDER|DRAFT|demo/i);
  assert.equal(/industry average|% of marketers|studies show/i.test(text), false);
  const audience = renderTourSteps(DEMO_FACTS)[1];
  assert.match(audience?.body || "", /48/);
  assert.match(audience?.body || "", /80/);
});

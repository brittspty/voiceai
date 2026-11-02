import assert from "node:assert/strict";
import test from "node:test";
import { applyGbpAssignment, defaultGbpClients, exampleGbpAssignments, locationChoices, suggestGbpClient } from "./gbp-mapping";
import { assignFromSetup, buildGbpSetup } from "./gbp-view";

const NOW = new Date("2026-11-02T15:00:00.000Z");

test("suggestions never assign a location, and staff confirmation does", () => {
  const clients = defaultGbpClients();
  const locations = locationChoices(NOW);
  const gulf = locations.find((row) => row.title.startsWith("Gulf"));
  const north = locations.find((row) => row.title.startsWith("Northline"));
  assert.ok(gulf && north);
  const gulfSuggestion = suggestGbpClient(gulf, clients);
  assert.equal(gulfSuggestion?.clientId, "gulf");
  assert.match(gulfSuggestion?.reason || "", /Nothing is assigned until you confirm/);
  assert.equal(suggestGbpClient(north, clients), null);
  const blank = buildGbpSetup({ now: NOW, assignments: {}, clients });
  assert.equal(blank.locations.every((row) => row.assignedClientId === ""), true);
  assert.equal(blank.status, "needs_setup");
  assert.equal(blank.managerEmail, "ads@specificityinc.com");
  const refused = applyGbpAssignment({ locations, clients, assignments: {}, locationId: gulf.locationId, marketingClientId: "" });
  assert.equal(refused.ok, false);
  const confirmed = assignFromSetup({ locationId: gulf.locationId, marketingClientId: "gulf", assignments: {}, now: NOW });
  assert.equal(confirmed.ok, true);
  if (confirmed.ok) assert.equal(confirmed.assignments[gulf.locationId], "gulf");
  const unknown = applyGbpAssignment({ locations, clients, assignments: {}, locationId: gulf.locationId, marketingClientId: "missing" });
  assert.equal(unknown.ok, false);
});

test("the example harbor mapping is a confirmed fixture, not a guessed one", () => {
  const setup = buildGbpSetup({ now: NOW, assignments: exampleGbpAssignments() });
  const harbor = setup.locations.find((row) => row.locationId === "501");
  const gulf = setup.locations.find((row) => row.locationId === "502");
  assert.equal(harbor?.assignedClientId, "harbor");
  assert.equal(gulf?.assignedClientId, "");
  assert.equal(gulf?.suggestedClientId, "gulf");
  assert.equal(setup.status, "needs_setup");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { optionalStaffLinks } from "./shell-nav";

test("the older shell adds Insights and Notifications only when those switches are on", () => {
  assert.deepEqual(optionalStaffLinks({ showInsights: false, showNotifications: false }), []);
  assert.deepEqual(optionalStaffLinks({ showInsights: true, showNotifications: false }), [{ href: "/insights", label: "Insights" }]);
  assert.deepEqual(optionalStaffLinks({ showInsights: false, showNotifications: true }), [{ href: "/notifications", label: "Notifications" }]);
  const shell = readFileSync(new URL("../components/shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /optionalStaffLinks/);
  const staffAt = shell.indexOf("const staffNav");
  const clientAt = shell.indexOf("const clientNav");
  assert.ok(staffAt > 0 && clientAt > staffAt);
  assert.equal(shell.slice(clientAt, clientAt + 500).includes("optionalStaffLinks"), false);
});

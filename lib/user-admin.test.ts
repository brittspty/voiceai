import assert from "node:assert/strict";
import test from "node:test";
import { allClientsViewerSeesCost, userAdminEnabled } from "./marketing/config";
import { accessFromUser } from "./marketing/access";
import { planAssignManager, planCreateViewer, planDeleteUser, planSetDisabled } from "./user-admin";

const viewer = { id: "v", role: "client_viewer", email: "view@example.com", disabledAt: null, workspaceId: "harbor" };
const manager = { id: "m", role: "account_manager", email: "am@example.com", disabledAt: null, workspaceId: null };
const admin = { id: "s", role: "super_admin", email: "sa@example.com", disabledAt: null, workspaceId: null };

test("user admin stays off and account managers cannot make super admins", () => {
  assert.equal(userAdminEnabled({}), false);
  assert.equal(userAdminEnabled({ USER_ADMIN_V2: "on" }), true);
  assert.equal(allClientsViewerSeesCost({}), false);
  const owner = accessFromUser({ id: "o", email: "owner@example.com", role: "owner" }, [], {});
  const client = accessFromUser(
    { id: "c", email: "view@example.com", role: "client_viewer" },
    [{ workspaceId: "harbor", scopeKind: "client", adAccountId: null, campaignId: null }],
    {},
  );
  assert.equal(owner.kind, "client_owner");
  assert.equal(owner.seesCost, false);
  assert.equal(client.seesCost, false);

  const off = planCreateViewer({
    enabled: false,
    actorKind: "super_admin",
    actorWorkspaces: ["harbor"],
    name: "Ada",
    email: "ada@example.com",
    password: "Correct-Horse-9",
    workspaceId: "harbor",
  });
  assert.equal(off.ok, false);

  const created = planCreateViewer({
    enabled: true,
    actorKind: "account_manager",
    actorWorkspaces: ["harbor"],
    name: "Ada",
    email: "ada@example.com",
    password: "Correct-Horse-9",
    workspaceId: "harbor",
  });
  assert.equal(created.ok, true);
  if (created.ok) assert.equal(created.role, "client_viewer");

  const otherClient = planCreateViewer({
    enabled: true,
    actorKind: "account_manager",
    actorWorkspaces: ["harbor"],
    name: "Ada",
    email: "ada@example.com",
    password: "Correct-Horse-9",
    workspaceId: "gulf",
  });
  assert.equal(otherClient.ok, false);

  const assigned = planAssignManager({
    enabled: true,
    actorKind: "account_manager",
    manager,
    workspaceId: "harbor",
  });
  assert.equal(assigned.ok, false);
  const byAdmin = planAssignManager({
    enabled: true,
    actorKind: "super_admin",
    manager: { id: "m", role: "super_admin" },
    workspaceId: "harbor",
  });
  assert.equal(byAdmin.ok, false);

  const disableAdmin = planSetDisabled({
    enabled: true,
    actorKind: "account_manager",
    actorId: "m",
    actorWorkspaces: ["harbor"],
    target: admin,
    disabled: true,
    superAdminsLeft: 1,
  });
  assert.equal(disableAdmin.ok, false);

  const disableViewer = planSetDisabled({
    enabled: true,
    actorKind: "account_manager",
    actorId: "m",
    actorWorkspaces: ["harbor"],
    target: viewer,
    disabled: true,
    superAdminsLeft: 1,
  });
  assert.equal(disableViewer.ok, true);

  const deleted = planDeleteUser({
    enabled: true,
    actorKind: "account_manager",
    actorId: "m",
    target: viewer,
    confirm: viewer.email,
    superAdminsLeft: 1,
  });
  assert.equal(deleted.ok, false);
  const confirmed = planDeleteUser({
    enabled: true,
    actorKind: "super_admin",
    actorId: "other",
    target: viewer,
    confirm: "VIEW@example.com",
    superAdminsLeft: 1,
  });
  assert.equal(confirmed.ok, true);
  const lastAdmin = planDeleteUser({
    enabled: true,
    actorKind: "super_admin",
    actorId: "other",
    target: admin,
    confirm: admin.email,
    superAdminsLeft: 0,
  });
  assert.equal(lastAdmin.ok, false);
});

import { passwordIssues } from "./marketing/access";

export type UserAdminTarget = {
  id: string;
  role: string;
  email: string;
  disabledAt: Date | null;
  workspaceId: string | null;
};

export function planAssignManager(input: {
  enabled: boolean;
  actorKind: string;
  manager: { id: string; role: string } | null;
  workspaceId: string;
}): { ok: true; userId: string; workspaceId: string } | { ok: false; reason: string } {
  if (!input.enabled) return { ok: false, reason: "User admin is turned off." };
  if (input.actorKind !== "super_admin") return { ok: false, reason: "Only a super admin can assign account managers." };
  if (!input.manager || input.manager.role !== "account_manager") return { ok: false, reason: "Choose an account manager." };
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return { ok: false, reason: "Choose a client." };
  return { ok: true, userId: input.manager.id, workspaceId };
}

export function planCreateViewer(input: {
  enabled: boolean;
  actorKind: string;
  actorWorkspaces: readonly string[];
  name: string;
  email: string;
  password: string;
  workspaceId: string;
}): { ok: true; name: string; email: string; password: string; workspaceId: string; role: "client_viewer" } | { ok: false; reason: string } {
  if (!input.enabled) return { ok: false, reason: "User admin is turned off." };
  if (input.actorKind !== "super_admin" && input.actorKind !== "account_manager") {
    return { ok: false, reason: "You cannot create client logins." };
  }
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return { ok: false, reason: "Choose a client." };
  if (input.actorKind === "account_manager" && !input.actorWorkspaces.includes(workspaceId)) {
    return { ok: false, reason: "You can only add a viewer for a client assigned to you." };
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, reason: "Enter a name." };
  if (!email.includes("@")) return { ok: false, reason: "Enter a work email." };
  const issues = passwordIssues(input.password, email);
  if (issues.length) return { ok: false, reason: issues[0] || "Choose a stronger password." };
  return { ok: true, name, email, password: input.password, workspaceId, role: "client_viewer" };
}

export function planSetDisabled(input: {
  enabled: boolean;
  actorKind: string;
  actorId: string;
  actorWorkspaces: readonly string[];
  target: UserAdminTarget | null;
  disabled: boolean;
  superAdminsLeft: number;
}): { ok: true; userId: string; disabled: boolean } | { ok: false; reason: string } {
  if (!input.enabled) return { ok: false, reason: "User admin is turned off." };
  if (input.actorKind !== "super_admin" && input.actorKind !== "account_manager") {
    return { ok: false, reason: "You cannot change accounts." };
  }
  const target = input.target;
  if (!target) return { ok: false, reason: "That person was not found." };
  if (target.id === input.actorId) return { ok: false, reason: "You can't change your own account here." };
  if (target.role === "super_admin" && input.actorKind !== "super_admin") {
    return { ok: false, reason: "An account manager cannot change a super admin." };
  }
  if (input.actorKind === "account_manager") {
    if (target.role !== "client_viewer" || !target.workspaceId || !input.actorWorkspaces.includes(target.workspaceId)) {
      return { ok: false, reason: "You can only turn client viewers on your clients off or on." };
    }
  }
  if (input.disabled && target.role === "super_admin" && input.superAdminsLeft < 1) {
    return { ok: false, reason: "Keep at least one super admin who can sign in." };
  }
  return { ok: true, userId: target.id, disabled: input.disabled };
}

export function planDeleteUser(input: {
  enabled: boolean;
  actorKind: string;
  actorId: string;
  target: UserAdminTarget | null;
  confirm: string;
  superAdminsLeft: number;
}): { ok: true; userId: string } | { ok: false; reason: string } {
  if (!input.enabled) return { ok: false, reason: "User admin is turned off." };
  if (input.actorKind !== "super_admin") return { ok: false, reason: "Only a super admin can delete an account." };
  const target = input.target;
  if (!target) return { ok: false, reason: "That person was not found." };
  if (target.id === input.actorId) return { ok: false, reason: "You can't delete your own account." };
  if (input.confirm.trim().toLowerCase() !== target.email.trim().toLowerCase()) {
    return { ok: false, reason: "Type the person's email to confirm." };
  }
  if (target.role === "super_admin" && input.superAdminsLeft < 1) {
    return { ok: false, reason: "Keep at least one super admin." };
  }
  return { ok: true, userId: target.id };
}

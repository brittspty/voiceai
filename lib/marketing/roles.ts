import type { Env } from "./config";
import { roleAdminEnabled } from "./config";

export const ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "viewer",
  "super_admin",
  "account_manager",
  "client_viewer",
  "all_clients_viewer",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function assignRolePlan(input: {
  actorKind: string;
  enabled: boolean;
  users: { id: string; role: string }[];
  targetId: string;
  nextRole: string;
}): { ok: true; userId: string; role: AssignableRole } | { ok: false; reason: string } {
  if (!input.enabled) return { ok: false, reason: "Role assignment is turned off." };
  if (input.actorKind !== "super_admin") return { ok: false, reason: "Only a super admin can assign roles." };
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(input.nextRole)) return { ok: false, reason: "That role is not assignable." };
  const target = input.users.find((user) => user.id === input.targetId);
  if (!target) return { ok: false, reason: "That person was not found." };
  const next = input.nextRole as AssignableRole;
  if (target.role === "super_admin" && next !== "super_admin") {
    const remaining = input.users.filter((user) => user.role === "super_admin" && user.id !== target.id).length;
    if (remaining < 1) return { ok: false, reason: "Keep at least one super admin." };
  }
  return { ok: true, userId: target.id, role: next };
}

export function roleAdminOpen(actorKind: string, env: Env = process.env) {
  return roleAdminEnabled(env) && actorKind === "super_admin";
}

import type { Env } from "./config";
import { WORKSPACE_ID } from "./types";

export const DEFAULT_SUPER_ADMINS = [
  { name: "Jason", email: "jason@specificityinc.example" },
  { name: "Brittany", email: "brittany@specificityinc.example" },
  { name: "Chris", email: "chris@specificityinc.example" },
] as const;

export type ScopeAssignment = {
  workspaceId: string;
  scopeKind: "client" | "ad_account" | "campaign";
  adAccountId: string | null;
  campaignId: string | null;
};

export type AccessUser = {
  id: string;
  email: string;
  role: string;
};

export type MarketingAccess = {
  userId: string;
  email: string;
  role: string;
  workspaceId: string;
  kind: "super_admin" | "account_manager" | "staff" | "client_owner" | "client_viewer" | "none";
  accounts: "all" | string[];
  campaigns: "all" | string[];
  seesCost: boolean;
  seesAlerts: boolean;
  canEditBudget: boolean;
  canCreateShareLink: boolean;
};

export function superAdminEmails(env: Env = process.env) {
  const raw = (env.MARKETING_SUPER_ADMIN_EMAILS || "").trim();
  if (!raw) return DEFAULT_SUPER_ADMINS.map((person) => person.email);
  return [...new Set(raw.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean))];
}

export function plannedSuperAdmins(env: Env = process.env) {
  const password = (env.SEED_SUPER_ADMIN_PASSWORD || "ChangeMe!super").trim() || "ChangeMe!super";
  const emails = superAdminEmails(env);
  const defaults = new Map<string, string>(DEFAULT_SUPER_ADMINS.map((person) => [person.email, person.name]));
  return emails.map((email) => ({
    name: defaults.get(email) || email.split("@")[0] || "Super admin",
    email,
    password,
  }));
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    super_admin: "Super admin",
    account_manager: "Account manager",
    client_viewer: "Client viewer",
    owner: "Owner",
    admin: "Admin",
    viewer: "Viewer",
  };
  return labels[role] || role;
}

export function passwordIssues(password: string, email = "") {
  const issues: string[] = [];
  if (password.length < 12) issues.push("Use at least 12 characters.");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    issues.push("Use upper and lower case letters and a number.");
  }
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length > 2 && password.toLowerCase().includes(local)) issues.push("Don't use the email name in the password.");
  return issues;
}

export function isSuperAdmin(user: { role: string; email: string }, env: Env = process.env) {
  if (user.role === "super_admin") return true;
  return superAdminEmails(env).includes(user.email.trim().toLowerCase());
}

export function accessFromUser(user: AccessUser, assignments: ScopeAssignment[], env: Env = process.env): MarketingAccess {
  const base = {
    userId: user.id,
    email: user.email,
    role: user.role,
    workspaceId: WORKSPACE_ID,
  };
  if (isSuperAdmin(user, env)) {
    return {
      ...base,
      kind: "super_admin",
      accounts: "all",
      campaigns: "all",
      seesCost: true,
      seesAlerts: true,
      canEditBudget: true,
      canCreateShareLink: true,
    };
  }
  if (user.role === "client_viewer") {
    const workspaces = [...new Set(assignments.map((row) => row.workspaceId))];
    const workspaceId = workspaces.length === 1 ? workspaces[0] : "";
    return {
      ...base,
      workspaceId,
      kind: workspaceId ? "client_viewer" : "none",
      accounts: "all",
      campaigns: "all",
      seesCost: false,
      seesAlerts: false,
      canEditBudget: false,
      canCreateShareLink: false,
    };
  }
  if (user.role === "account_manager") {
    const mine = assignments.filter((row) => row.workspaceId === WORKSPACE_ID);
    const clientWide = mine.some((row) => row.scopeKind === "client");
    const accounts = clientWide ? ("all" as const) : [...new Set(mine.map((row) => row.adAccountId).filter((id): id is string => Boolean(id)))];
    const campaignIds = mine.map((row) => row.campaignId).filter((id): id is string => Boolean(id));
    const campaigns = clientWide || (accounts !== "all" && accounts.length > 0 && campaignIds.length === 0) ? ("all" as const) : campaignIds;
    return {
      ...base,
      kind: "account_manager",
      accounts,
      campaigns,
      seesCost: true,
      seesAlerts: true,
      canEditBudget: true,
      canCreateShareLink: clientWide || accounts === "all" || (Array.isArray(accounts) && accounts.length > 0) || campaignIds.length > 0,
    };
  }
  if (user.role === "owner") {
    return {
      ...base,
      kind: "client_owner",
      accounts: "all",
      campaigns: "all",
      seesCost: false,
      seesAlerts: true,
      canEditBudget: false,
      canCreateShareLink: false,
    };
  }
  if (user.role === "admin" || user.role === "viewer") {
    return {
      ...base,
      kind: "staff",
      accounts: "all",
      campaigns: "all",
      seesCost: false,
      seesAlerts: user.role !== "viewer",
      canEditBudget: false,
      canCreateShareLink: false,
    };
  }
  return {
    ...base,
    kind: "none",
    accounts: [],
    campaigns: [],
    seesCost: false,
    seesAlerts: false,
    canEditBudget: false,
    canCreateShareLink: false,
  };
}

export function coversAccount(access: MarketingAccess, adAccountId: string) {
  if (access.kind === "none" || access.kind === "client_viewer") return access.kind === "client_viewer" && access.workspaceId === WORKSPACE_ID;
  if (access.accounts === "all") return true;
  return access.accounts.includes(adAccountId);
}

export function coversCampaign(access: MarketingAccess, input: { adAccountId: string; campaignId: string }) {
  if (access.kind === "none") return false;
  if (access.kind === "client_viewer") return access.workspaceId === WORKSPACE_ID;
  if (access.campaigns === "all") return coversAccount(access, input.adAccountId);
  return access.campaigns.includes(input.campaignId);
}

export function canEditCampaignBudget(access: MarketingAccess, input: { adAccountId: string; campaignId: string }) {
  if (!access.canEditBudget) return false;
  return coversCampaign(access, input);
}

import type { ClientConfig } from "./client-config";

export type PlannedSeedUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "owner" | "admin" | "viewer";
  totpEnabled: boolean;
  totpSecret: null;
};

type SeedPeople = Pick<ClientConfig, "sampleData" | "companyName" | "agentName" | "owner" | "admin" | "viewer">;

function person(
  id: string,
  role: PlannedSeedUser["role"],
  account: { name: string; email: string; password: string },
): PlannedSeedUser {
  return {
    id,
    name: account.name,
    email: account.email,
    password: account.password,
    role,
    totpEnabled: false,
    totpSecret: null,
  };
}

/** Demo admin and viewer exist only when sample data is on. Production gets the owner. */
export function plannedSeedUsers(cfg: SeedPeople): PlannedSeedUser[] {
  const owner = person("user_owner", "owner", cfg.owner);
  if (!cfg.sampleData) return [owner];
  return [
    owner,
    person("user_admin", "admin", cfg.admin),
    person("user_viewer", "viewer", cfg.viewer),
  ];
}

export const SAMPLE_ACTIVITY_ACTIONS = [
  "Published calling rules",
  "Added an office",
  "Published a knowledge document",
] as const;

export function seedStartupLines(cfg: SeedPeople) {
  const lines = [
    `Seeded ${cfg.companyName}.`,
    `Agent  ${cfg.agentName}`,
    `Owner  ${cfg.owner.email}`,
  ];
  if (cfg.sampleData) {
    lines.push(`Admin  ${cfg.admin.email}`, `Viewer ${cfg.viewer.email}`);
  }
  return lines;
}

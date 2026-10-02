import { clientConfig, type ClientConfig } from "./client-config";
import { prisma } from "./db";

export type Brand = {
  companyName: string;
  subtitle: string;
  agentName: string;
  timezone: string;
  brandColor: string;
  logoUrl: string;
  mark: string;
};

export function brandFromConfig(cfg: ClientConfig = clientConfig()): Brand {
  return {
    companyName: cfg.companyName,
    subtitle: cfg.subtitle,
    agentName: cfg.agentName,
    timezone: cfg.timezone,
    brandColor: cfg.brandColor,
    logoUrl: cfg.logoUrl,
    mark: cfg.mark,
  };
}

export async function loadBrand(): Promise<Brand> {
  try {
    const org = await prisma.org.findUnique({ where: { id: "org" } });
    if (!org) return brandFromConfig();
    const cfg = clientConfig();
    return {
      companyName: org.name,
      subtitle: org.subtitle,
      agentName: org.agentName,
      timezone: org.timezone,
      brandColor: org.brandColor || cfg.brandColor,
      logoUrl: org.logoUrl || "",
      mark: org.mark || cfg.mark,
    };
  } catch {
    return brandFromConfig();
  }
}

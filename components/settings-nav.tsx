"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { conversionAccess } from "@/lib/marketing/offline/access";

export const SETTINGS_LINKS = [
  ["/settings/production", "Go-live checklist"],
  ["/settings/calling", "Call settings"],
  ["/settings/branding", "Branding"],
  ["/settings/agent", "Avery's script"],
  ["/settings/voice", "Avery's voice"],
  ["/settings/calling-rules", "Calling rules"],
  ["/settings/offices", "Locations"],
  ["/settings/users", "Team & security"],
  ["/settings/capabilities", "What Avery can do"],
  ["/settings/integrations", "Connections"],
  ["/settings/activity", "Activity log"],
] as const;

const SUPPORT_LINKS = [
  ["/settings/failed-jobs", "Failed jobs"],
  ["/settings/test-console", "Place a test call"],
] as const;

function settingsLinks(role: string, email: string, userId: string, showRoles: boolean) {
  const hidden = role === "owner" || role === "super_admin" ? new Set<string>() : new Set(["/settings/users", "/settings/integrations", "/settings/production"]);
  const links = SETTINGS_LINKS.filter(([href]) => !hidden.has(href)).map(([href, label]) => [href, label] as [string, string]);
  if (showRoles) links.push(["/settings/roles", "Roles"]);
  if (conversionAccess({ id: userId, role, email }).ok) {
    const at = links.findIndex(([href]) => href === "/settings/integrations");
    links.splice(at >= 0 ? at + 1 : links.length, 0, ["/settings/conversions", "Conversion feedback"]);
  }
  return links;
}

export function SettingsNav({ role = "", email = "", userId = "", showRoles = false }: { role?: string; email?: string; userId?: string; showRoles?: boolean }) {
  const pathname = usePathname();
  const current = pathname === "/settings/go-live" ? "/settings/production" : pathname;
  return (
    <nav className="flex gap-1 overflow-x-auto md:w-52 md:flex-col">
      {settingsLinks(role, email, userId, showRoles).map(([href, label]) => (
        <Link key={href} href={href} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", current === href ? "bg-hover font-medium" : "text-muted hover:bg-hover")}>
          {label}
        </Link>
      ))}
      <div className="mt-3 px-3 text-[11px] font-medium uppercase tracking-wide text-muted">Support tools</div>
      {SUPPORT_LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", current === href ? "bg-hover font-medium" : "text-muted hover:bg-hover")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

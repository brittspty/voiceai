"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

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

export function SettingsNav() {
  const pathname = usePathname();
  const current = pathname === "/settings/go-live" ? "/settings/production" : pathname;
  return (
    <nav className="flex gap-1 overflow-x-auto md:w-52 md:flex-col">
      {SETTINGS_LINKS.map(([href, label]) => (
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

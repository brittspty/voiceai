"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const SETTINGS_LINKS = [
  ["/settings/calling", "Call settings"],
  ["/settings/agent", "Agent"],
  ["/settings/voice", "Voice"],
  ["/settings/calling-rules", "Calling rules"],
  ["/settings/offices", "Offices"],
  ["/settings/users", "Users"],
  ["/settings/capabilities", "Capabilities"],
  ["/settings/integrations", "Integrations"],
  ["/settings/activity", "Activity log"],
  ["/settings/failed-jobs", "Failed jobs"],
  ["/settings/test-console", "Test console"],
  ["/settings/production", "Production ready"],
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:w-48 md:flex-col">
      {SETTINGS_LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-sm", pathname === href ? "bg-hover font-medium" : "text-muted hover:bg-hover")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

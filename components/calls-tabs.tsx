"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  ["/calls", "All calls"],
  ["/calls/appointments", "Appointments"],
  ["/calls/calendar", "Calendar"],
  ["/calls/contacts", "Contacts"],
  ["/calls/do-not-call", "Do-not-call"],
  ["/calls/crm", "CRM"],
  ["/calls/voice", "Voice"],
] as const;

export function CallsTabs() {
  const pathname = usePathname();
  return (
    <div className="relative mb-4">
    <div className="flex gap-1 overflow-x-auto rounded-full bg-chip p-1 text-sm">
      {TABS.map(([href, label]) => {
        const active = href === "/calls" ? pathname === "/calls" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("whitespace-nowrap rounded-full px-3 py-1.5", active ? "bg-card font-medium shadow-[var(--shadow)]" : "text-muted")}>
            {label}
          </Link>
        );
      })}
    </div>
    <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-full bg-gradient-to-l from-chip to-transparent sm:hidden" aria-hidden="true" />
    </div>
  );
}

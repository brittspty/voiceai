"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, FileText, LayoutDashboard, Moon, PanelLeft, Phone, RefreshCw, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/settings/calling", label: "Settings", icon: Settings },
];

export function AppShell({
  org,
  user,
  children,
}: {
  org: { name: string; subtitle: string };
  user: { name: string; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const itemActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href === "/settings/calling" ? "/settings" : href));

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-3 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#2563eb] text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 20V9l8-5 8 5v11" />
            <path d="M9 20v-6h6v6" />
          </svg>
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold">{org.name}</div>
            <div className="text-xs text-muted">{org.subtitle}</div>
          </div>
        )}
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = itemActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", active ? "bg-hover font-medium text-ink" : "text-zinc-600 hover:bg-hover dark:text-zinc-300")}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 pb-4">
        <Link href="/docs" className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-hover dark:text-zinc-300", pathname === "/docs" && "bg-hover text-ink")}>
          <FileText className="h-4 w-4" />
          {!collapsed && (
            <>
              Docs
              <svg className="ml-auto h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 17 17 7M9 7h8v8" /></svg>
            </>
          )}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-line bg-sidebar md:block", collapsed ? "w-[72px]" : "w-[220px]")}>{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="relative h-full w-[240px] bg-sidebar">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-canvas/95 px-4 backdrop-blur">
          <button className="rounded-md p-1.5 text-muted hover:bg-hover" onClick={() => (window.innerWidth < 768 ? setOpen(true) : setCollapsed((v) => !v))} aria-label="Toggle sidebar">
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">Voice Operations</div>
          <div className="ml-auto flex items-center gap-1">
            <button className="rounded-full p-2 text-muted hover:bg-hover" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle color theme">
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </button>
            <button className="rounded-full p-2 text-muted hover:bg-hover" onClick={() => router.refresh()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
            <Dropdown.Root>
              <Dropdown.Trigger className="ml-1 grid h-8 w-8 place-items-center rounded-full border border-line bg-card text-xs font-medium" aria-label="Account menu">
                {user.name.slice(0, 1)}
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="z-50 w-64 rounded-xl border border-line bg-card p-2 shadow-lg" align="end" sideOffset={8}>
                  <div className="px-2 py-1.5">
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="text-xs text-muted">{user.email}</div>
                    <div className="mt-1 text-xs capitalize text-muted">{user.role}</div>
                  </div>
                  <Dropdown.Item asChild>
                    <Link href="/settings/users" className="block rounded-md px-2 py-1.5 text-sm outline-none hover:bg-hover">Two-step sign-in</Link>
                  </Dropdown.Item>
                  <form action="/api/auth/logout" method="post">
                    <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover">Sign out</button>
                  </form>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

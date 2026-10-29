"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, BookOpen, FileText, LayoutDashboard, Moon, PanelLeft, Phone, RefreshCw, Settings, Sun, Timer } from "lucide-react";
import { useTheme } from "next-themes";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { BrandMark } from "@/components/brand-mark";
import { roleLabel } from "@/lib/marketing/access";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/marketing", label: "Marketing", icon: BarChart3 },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/settings/calling", label: "Settings", icon: Settings },
];

export function AppShell({
  org,
  user,
  mode,
  showSpeedToLead = false,
  children,
}: {
  org: { name: string; subtitle: string; brandColor: string; logoUrl: string; mark: string };
  user: { name: string; email: string; role: string };
  mode: { testMode: boolean; agentName: string; wordmark: string; tagline: string };
  showSpeedToLead?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const itemActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/marketing") return pathname === "/marketing" || (pathname.startsWith("/marketing/") && !pathname.startsWith("/marketing/speed-to-lead"));
    const base = href === "/settings/calling" ? "/settings" : href;
    return pathname === href || pathname.startsWith(base);
  };
  const staffNav = showSpeedToLead
    ? [NAV[0], NAV[1], { href: "/marketing/speed-to-lead", label: "Speed-to-lead", icon: Timer }, ...NAV.slice(2)]
    : NAV;

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-3 py-4">
        <BrandMark brandColor={org.brandColor} logoUrl={org.logoUrl} mark={org.mark} />
        {!collapsed && <div className="text-sm font-semibold">{mode.wordmark}</div>}
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {(user.role === "client_viewer" ? [{ href: "/marketing/client", label: "Performance", icon: BarChart3 }] : staffNav).map((item) => {
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
        {user.role !== "client_viewer" && <Link href="/docs" className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-hover dark:text-zinc-300", pathname === "/docs" && "bg-hover text-ink")}>
          <FileText className="h-4 w-4" />
          {!collapsed && "Help"}
        </Link>}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-line bg-sidebar md:block", collapsed ? "w-[72px]" : "w-[220px]")}>{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-overlay" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="relative h-full w-[240px] bg-sidebar">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-2 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur">
          <button className="rounded-md p-1.5 text-muted hover:bg-hover" onClick={() => (narrow ? setOpen(true) : setCollapsed((v) => !v))} aria-label="Toggle sidebar">
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-medium">{mode.wordmark}</div>
          {user.role !== "client_viewer" && (
            <Link
              href="/settings/production"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                mode.testMode ? "bg-amber-100 text-amber-950" : "bg-emerald-100 text-emerald-950",
              )}
            >
              <span aria-hidden="true">●</span>
              {mode.testMode ? "Test mode: no real calls" : `Live: ${mode.agentName} is calling leads`}
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button className="rounded-full p-2 text-muted hover:bg-hover" title="Switch theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Switch theme">
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </button>
            <button className="rounded-full p-2 text-muted hover:bg-hover" title="Refresh data" onClick={() => router.refresh()} aria-label="Refresh data">
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
                    <div className="mt-1 text-xs text-muted">{roleLabel(user.role)}</div>
                  </div>
                  {user.role !== "client_viewer" && user.role !== "account_manager" && (
                    <Dropdown.Item asChild>
                      <Link href="/settings/users" className="block rounded-md px-2 py-1.5 text-sm outline-none hover:bg-hover">Two-step sign-in</Link>
                    </Dropdown.Item>
                  )}
                  <form action="/api/auth/logout" method="post">
                    <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover">Sign out</button>
                  </form>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        <footer className="border-t border-line px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 md:px-8">
          © {mode.wordmark} · {mode.tagline} · <Link className="underline" href="/privacy">Privacy</Link> · <Link className="underline" href="/terms">Terms</Link> · <Link className="underline" href="/contact">Support</Link>
        </footer>
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

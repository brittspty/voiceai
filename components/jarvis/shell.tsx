"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SENSITIVE_CAPTURE_ATTRIBUTE, sensitiveCaptureClass } from "@/lib/analytics/capture";
import { BRAND_TAGLINE, PRODUCT_WORDMARK } from "@/lib/brand";
import { navActive, type NavItem } from "@/lib/marketing/channels/nav";
import "./jarvis.css";

export function JarvisShell({
  productName,
  wordmark,
  logoOnDark,
  logoOnLight,
  items,
  unread,
  moreChannels,
  account,
  realClients,
  children,
}: {
  productName: string;
  wordmark: string;
  logoOnDark: string;
  logoOnLight: string;
  items: NavItem[];
  unread: number;
  moreChannels?: string | null;
  account?: { name: string; email: string; showTeam: boolean; showRoles: boolean; showPeople: boolean };
  realClients?: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const pathClient = pathname.startsWith("/c/") ? pathname.split("/")[2] || "" : "";
  const rawClient = pathClient && pathClient !== "all" ? pathClient : params.get("client") || "";
  const selectedClient = realClients?.some((client) => client.id === rawClient) ? rawClient : "";
  const hrefFor = (href: string) => {
    const nextPath = (realClients ? href.replace(/^\/c\/all(?=\/)/, `/c/${selectedClient || "all"}`) : href).split("?")[0];
    const query = new URLSearchParams();
    const days = params.get("d") || params.get("days") || params.get("range");
    const status = params.get("st");
    if (days) query.set("d", days);
    if (status) query.set("st", status);
    if (selectedClient && !nextPath.startsWith("/c/")) query.set("client", selectedClient);
    const text = query.toString();
    return text ? `${nextPath}?${text}` : nextPath;
  };
  const [more, setMore] = useState(false);
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const group = groups.find((row) => row.name === item.group);
    if (group) group.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  const mobile = [
    { href: "/", label: `${PRODUCT_WORDMARK} home` },
    { href: "/decisions", label: "Decisions" },
    { href: "/c/all/meta", label: "Channels" },
    { href: "/leads", label: "Leads" },
  ];
  return (
    <div className="jarvis">
      <div className="app">
        <nav className="side" aria-label="Main">
          <div className="logo">
            <img src={logoOnDark} alt="Specificity Inc" />
          </div>
          <div className="prod">
            {productName}
            <span>by {wordmark}</span>
          </div>
          {groups.map((group) => (
            <div key={group.name}>
              <h6>{group.name}</h6>
              {group.items.map((item) => {
                const href = hrefFor(item.href);
                const on = navActive(pathname, href);
                return (
                  <Link key={item.href} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
                    {item.label}
                    {item.count ? <span className="ct">{item.count}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="foot">
            {account ? <AccountMenu account={account} /> : null}
            <div>{BRAND_TAGLINE}</div>
          </div>
        </nav>
        <div className="maincol">
          <header className="mobile-logo">
            <img src={logoOnLight} alt="Specificity Inc" />
            <Link href="/live" className="bell" aria-label={`Notifications, ${unread} unread`}>
              <span aria-hidden="true">🔔</span>
              <b>{unread}</b>
            </Link>
          </header>
          {realClients ? (
            <div className="ctl" style={{ padding: "16px 40px 0" }}>
              <label htmlFor="jarvis-client">Client</label>
              <select
                id="jarvis-client"
                aria-label="Client"
                className="sel"
                value={selectedClient}
                onChange={(event) => {
                  const next = event.target.value;
                  if (pathname.startsWith("/c/")) {
                    const parts = pathname.split("/");
                    parts[2] = next || "all";
                    const query = new URLSearchParams(params.toString());
                    query.delete("client");
                    const text = query.toString();
                    router.push(text ? `${parts.join("/")}?${text}` : parts.join("/"));
                    return;
                  }
                  const query = new URLSearchParams(params.toString());
                  if (next) query.set("client", next);
                  else query.delete("client");
                  const text = query.toString();
                  router.push(text ? `${pathname}?${text}` : pathname);
                }}
              >
                <option value="">All clients</option>
                {realClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          {children}
          <nav className="tabbar" aria-label="Main">
            {mobile.map((item) => (
              <Link key={item.href} href={hrefFor(item.href)} className={navActive(pathname, hrefFor(item.href)) ? "on" : undefined}>
                {item.label}
                {item.href === "/decisions" ? ` ${items.find((row) => row.href === "/decisions")?.count ?? ""}` : ""}
              </Link>
            ))}
            <button type="button" className={more ? "on" : undefined} onClick={() => setMore((value) => !value)} aria-expanded={more}>
              More
            </button>
          </nav>
          {more && (
            <div className="more">
              <img src={logoOnLight} alt="Specificity Inc" style={{ height: 28 }} />
              {moreChannels ? <p className="tag">{moreChannels}</p> : null}
              {items
                .filter((item) => !mobile.some((row) => row.href === item.href))
                .map((item) => (
                  <Link key={item.href} href={hrefFor(item.href)} onClick={() => setMore(false)}>
                    {item.label}
                  </Link>
                ))}
              <Link href="/live" onClick={() => setMore(false)} aria-label={`Notifications, ${unread} unread`}>
                Live notes ({unread} unread)
              </Link>
              {account ? <AccountMenu account={account} onNavigate={() => setMore(false)} /> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountMenu({ account, onNavigate }: { account: { name: string; email: string; showTeam: boolean; showRoles: boolean; showPeople: boolean }; onNavigate?: () => void }) {
  return (
    <details className={sensitiveCaptureClass("acct")} {...{ [SENSITIVE_CAPTURE_ATTRIBUTE]: "" }}>
      <summary aria-label="Account menu">{account.name.slice(0, 1)} {account.name}</summary>
      <div className="panel">
        <p>{account.email}</p>
        {account.showTeam ? <Link href="/settings/users" onClick={onNavigate}>Team & security</Link> : null}
        {account.showRoles ? <Link href="/settings/roles" onClick={onNavigate}>Roles</Link> : null}
        {account.showPeople ? <Link href="/settings/people" onClick={onNavigate}>People</Link> : null}
        <form action="/api/auth/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </details>
  );
}

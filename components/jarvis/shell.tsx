"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BRAND_TAGLINE } from "@/lib/brand";
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
  children,
}: {
  productName: string;
  wordmark: string;
  logoOnDark: string;
  logoOnLight: string;
  items: NavItem[];
  unread: number;
  moreChannels?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const group = groups.find((row) => row.name === item.group);
    if (group) group.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  const mobile = [
    { href: "/", label: "Home" },
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
                const on = navActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
                    {item.label}
                    {item.count ? <span className="ct">{item.count}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="foot">{BRAND_TAGLINE}</div>
        </nav>
        <div className="maincol">
          <header className="mobile-logo">
            <img src={logoOnLight} alt="Specificity Inc" />
            <Link href="/live" className="bell" aria-label={`Notifications, ${unread} unread`}>
              <span aria-hidden="true">🔔</span>
              <b>{unread}</b>
            </Link>
          </header>
          {children}
          <nav className="tabbar" aria-label="Main">
            {mobile.map((item) => (
              <Link key={item.href} href={item.href} className={navActive(pathname, item.href) ? "on" : undefined}>
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
                  <Link key={item.href} href={item.href} onClick={() => setMore(false)}>
                    {item.label}
                  </Link>
                ))}
              <Link href="/live" onClick={() => setMore(false)} aria-label={`Notifications, ${unread} unread`}>
                Live notes ({unread} unread)
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

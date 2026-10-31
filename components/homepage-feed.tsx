"use client";

import { useEffect, useRef, useState } from "react";
import { feedShouldAdvance } from "@/lib/homepage-feed";
import type { FeedItem } from "@/lib/homepage-content";

type Shown = FeedItem & { fresh: boolean; key: string };

export function HomepageFeed({ items, example }: { items: FeedItem[]; example: string }) {
  const [shown, setShown] = useState<Shown[]>(() => items.slice(0, 4).map((item, index) => ({ ...item, fresh: false, key: `s${index}` })));
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const cursor = useRef(4);
  const serial = useRef(4);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => setOnScreen(Boolean(entries[0]?.isIntersecting)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!feedShouldAdvance({ hovering, focused, reducedMotion }) || !onScreen || items.length < 2) return;
    const id = window.setInterval(() => {
      const item = items[cursor.current % items.length];
      cursor.current += 1;
      const key = `n${serial.current++}`;
      setShown((current) => [{ ...item, fresh: !reducedMotion, key }, ...current].slice(0, 4));
    }, 4200);
    return () => window.clearInterval(id);
  }, [focused, hovering, items, onScreen, reducedMotion]);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocused(false);
      }}
    >
      <ul className="feed" aria-label="Example decision feed">
        {shown.map((item) => (
          <li key={item.key} className={item.fresh ? "in" : undefined}>
            <b>{item.title}</b>
            {item.body}
            <br />
            <span>{example}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

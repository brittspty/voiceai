"use client";

import { useEffect, useState } from "react";
import { feedShouldAdvance } from "@/lib/homepage-feed";

export function HomepageFeed({
  items,
  className,
  mono,
}: {
  items: string[];
  className: string;
  mono: string;
}) {
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const safeIndex = items.length ? index % items.length : 0;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!feedShouldAdvance({ hovering, focused, reducedMotion }) || items.length < 2) return;
    const id = window.setInterval(() => setIndex((current) => (current + 1) % items.length), 3200);
    return () => window.clearInterval(id);
  }, [focused, hovering, items.length, reducedMotion]);

  if (!items.length) return null;

  return (
    <div
      className={className}
      tabIndex={0}
      aria-label="Placeholder activity"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocused(false);
      }}
    >
      <p className="text-xs uppercase tracking-wide" style={{ fontFamily: mono }}>
        PLACEHOLDER
      </p>
      <p className="mt-3 min-h-16 text-lg leading-7" style={{ fontFamily: mono }} aria-live="off">
        {items[safeIndex]}
      </p>
      <div className="mt-4 flex gap-2">
        {items.map((item, itemIndex) => (
          <button
            key={item}
            type="button"
            aria-label="Show this update"
            aria-pressed={itemIndex === safeIndex}
            className="h-2.5 w-2.5 rounded-full border border-current"
            style={{ background: itemIndex === safeIndex ? "currentColor" : "transparent" }}
            onClick={() => setIndex(itemIndex)}
          />
        ))}
      </div>
    </div>
  );
}

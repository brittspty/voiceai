"use client";

import { useEffect, useRef } from "react";

/** Adds .on as sections enter. Reduced motion shows them immediately. */
export function HomepageReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    document.documentElement.classList.add("js");
    const nodes = [...root.querySelectorAll<HTMLElement>(".rv")];
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const show = () => nodes.forEach((node) => node.classList.add("on"));
    if (media.matches || !("IntersectionObserver" in window)) {
      show();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("on");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    const onChange = () => {
      if (media.matches) show();
    };
    media.addEventListener("change", onChange);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <div ref={ref} className="reveal-root">
      {children}
    </div>
  );
}

export const HOMEPAGE_REVEAL_SCRIPT = `(function(){
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nodes = document.querySelectorAll(".home .rv");
  if (reduced || !("IntersectionObserver" in window)) {
    nodes.forEach(function(node){ node.classList.add("on"); });
    return;
  }
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (!entry.isIntersecting) return;
      entry.target.classList.add("on");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  nodes.forEach(function(node){ observer.observe(node); });
})();`;

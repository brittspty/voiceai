"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Phone menu. The button is visible below 960px, including a 390px screen. */
export function HomepageMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const menu = document.getElementById("header-menu");
    const close = menu?.querySelector<HTMLElement>("[data-close]");
    close?.focus();
    const button = buttonRef.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !menu) return;
      const items = [...menu.querySelectorAll<HTMLElement>("a, button")];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="menu-btn md:hidden"
        aria-expanded={open}
        aria-controls="header-menu"
        onClick={() => setOpen(true)}
      >
        Menu
      </button>
      <div
        id="header-menu"
        className={`mnav${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        hidden={!open}
        onClick={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("a")) setOpen(false);
        }}
      >
        <div className="tp">
          <p id={titleId} className="mono lab">
            Menu
          </p>
          <button type="button" className="menu-btn" data-close="" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

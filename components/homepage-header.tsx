"use client";

import { useEffect, useState } from "react";

/** Phone header. The button is visible below the md breakpoint, including a 390px screen. */
export function HomepageMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex flex-col items-end gap-3">
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-full border border-current px-4 text-sm font-semibold md:hidden"
        aria-expanded={open}
        aria-controls="header-menu"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close menu" : "Menu"}
      </button>
      <nav
        id="header-menu"
        aria-label="Sign in"
        className={`${open ? "flex" : "hidden"} w-full flex-col gap-2 md:flex md:w-auto md:flex-row md:items-center`}
      >
        {children}
      </nav>
    </div>
  );
}

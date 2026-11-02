"use client";

import { useEffect, useState } from "react";
import { DashboardSkeleton } from "@/components/ux-skeleton";

/** Plain loading skeleton. Elapsed time is the only live text. */
export function InsightsLoadingSkeleton() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(tick);
  }, []);
  return (
    <div aria-busy="true">
      <p className="mb-3 font-mono text-xs text-muted" aria-live="off">{seconds}s</p>
      <DashboardSkeleton />
    </div>
  );
}

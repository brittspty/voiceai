"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "voiceops-hide-test-strip";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismissed() {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function hideStrip() {
  window.localStorage.setItem(STORAGE_KEY, "1");
  listeners.forEach((listener) => listener());
}

export function TestModeStrip({ show }: { show: boolean }) {
  const hidden = useSyncExternalStore(subscribe, dismissed, () => false);
  if (!show || hidden) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>
        <span className="font-medium">Test mode.</span> Calls go only to test numbers.{" "}
        <Link href="/settings/production" className="font-medium underline">Finish go-live setup →</Link>
      </p>
      <button type="button" className="shrink-0 rounded-md px-2 py-1 text-xs underline" aria-label="Dismiss test mode message" onClick={hideStrip}>
        Dismiss
      </button>
    </div>
  );
}

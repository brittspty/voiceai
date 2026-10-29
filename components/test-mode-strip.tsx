"use client";

import Link from "next/link";
import { useState } from "react";
import { dismissTestStrip } from "@/lib/actions";

export function TestModeStrip({ show }: { show: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [pending, setPending] = useState(false);
  if (!show || hidden) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>
        <span className="font-medium">Test mode.</span> Calls go only to test numbers.{" "}
        <Link href="/settings/production" className="font-medium underline">Finish go-live setup →</Link>
      </p>
      <button
        type="button"
        className="shrink-0 rounded-md px-2 py-1 text-xs underline disabled:opacity-60"
        aria-label="Dismiss test mode message"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await dismissTestStrip();
            setHidden(true);
          } finally {
            setPending(false);
          }
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

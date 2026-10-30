"use client";

import { ERROR_COPY } from "@/lib/marketing/speed-to-lead";

export default function SpeedError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-card p-4">
      <h1 className="text-lg font-semibold">Speed-to-lead</h1>
      <p className="mt-2">{ERROR_COPY}</p>
      <button type="button" onClick={reset} className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-lg px-4">
        Retry
      </button>
    </div>
  );
}

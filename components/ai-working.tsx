"use client";

import { useEffect, useState } from "react";

const FLOWS = {
  insights: {
    title: "Building your insights",
    steps: ["Reading campaign results", "Comparing channels and audiences", "Checking audience match rates", "Writing recommendations"],
  },
  digest: {
    title: "Building your digest",
    steps: ["Gathering this period's results", "Comparing to last period", "Writing your digest"],
  },
  resolution: {
    title: "Checking match rates",
    steps: ["Uploading identifiers", "Matching on each platform", "Counting matched and unmatched", "Updating the trend"],
  },
} as const;

export function AiWorking({ kind, failed = false, reference = "" }: { kind: keyof typeof FLOWS; failed?: boolean; reference?: string }) {
  const flow = FLOWS[kind];
  const [visible, setVisible] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const show = window.setTimeout(() => setVisible(true), 1000);
    const tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      window.clearTimeout(show);
      window.clearInterval(tick);
    };
  }, []);
  if (failed) {
    return (
      <div role="alert" className="max-w-xl rounded-xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">We couldn&apos;t finish this. Nothing was changed.</h2>
        <a href="" className="btn-brand mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm">Try again</a>
        {reference ? <p className="mt-3 font-mono text-xs">Reference: {reference}</p> : null}
      </div>
    );
  }
  if (!visible) return null;
  if (stopped) {
    return (
      <div role="status" className="max-w-xl rounded-xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">You stopped this. Nothing was changed.</h2>
        <button type="button" className="btn-brand mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm" onClick={() => setStopped(false)}>
          Start again
        </button>
      </div>
    );
  }
  const active = Math.min(flow.steps.length - 1, Math.floor(elapsed / 8));
  return (
    <div role="status" aria-live="polite" className="max-w-xl rounded-xl border border-line bg-card p-6">
      <p className="text-xs uppercase tracking-wide text-muted">{flow.title} · {elapsed}s</p>
      <h2 className="mt-1 text-lg font-semibold">{flow.title}</h2>
      <ol className="mt-3 grid gap-1 text-sm">
        {flow.steps.map((step, index) => (
          <li key={step}>
            {index < active ? "Done" : index === active ? "Active" : "Pending"} · {step}
          </li>
        ))}
      </ol>
      {elapsed > 30 ? <p className="mt-3 text-sm">This is taking longer than usual. You can leave this page; results stay here when they&apos;re done.</p> : null}
      <button type="button" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm" onClick={() => setStopped(true)}>
        Stop
      </button>
    </div>
  );
}

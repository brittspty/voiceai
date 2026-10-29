"use client";

export default function GoogleAdsConnectionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-card p-6">
      <h1 className="text-xl font-semibold">Couldn&apos;t load Google Ads status</h1>
      <p className="mt-2 text-sm text-muted">Refresh the page. If this keeps happening, contact your account manager.</p>
      <button className="btn-brand mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm" type="button" onClick={() => reset()}>
        Retry
      </button>
    </div>
  );
}

"use client";

export default function LandingPagesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">{"Couldn't load landing pages."}</h1>
      <p className="mt-2 text-sm text-muted">Contact your account manager if this keeps happening.</p>
      <button type="button" className="btn-brand mt-4 inline-flex min-h-11 items-center rounded-full px-4 text-sm" onClick={() => reset()}>
        Retry
      </button>
    </div>
  );
}

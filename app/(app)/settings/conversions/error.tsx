"use client";

export default function ConversionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4" role="alert">
      <p>Could not load conversion feedback.</p>
      <button type="button" className="btn-brand mt-3 min-h-11 rounded-full px-4 text-sm" onClick={() => reset()}>Retry</button>
    </div>
  );
}

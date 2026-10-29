export default function LandingPagesLoading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">Loading landing pages…</p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-14 animate-pulse rounded-2xl bg-chip" />
        ))}
      </div>
    </div>
  );
}

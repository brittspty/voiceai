export default function SpeedLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">Loading speed-to-lead…</p>
      <div className="mt-4 space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-chip" />
        <div className="h-32 animate-pulse rounded-xl bg-chip" />
        <div className="h-32 animate-pulse rounded-xl bg-chip" />
      </div>
    </div>
  );
}

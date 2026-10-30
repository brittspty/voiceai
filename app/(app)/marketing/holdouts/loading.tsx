export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">Loading holdout tests…</p>
      <div className="mt-4 h-28 animate-pulse rounded-xl bg-card" />
    </div>
  );
}

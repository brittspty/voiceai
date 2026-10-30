export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">Loading wasted searches…</p>
      <div className="mt-4 h-24 animate-pulse rounded-xl bg-card" />
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">Loading competitor ads…</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-xl bg-card" />
        <div className="h-32 animate-pulse rounded-xl bg-card" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true">
      <p className="text-sm text-muted">Loading conversion feedback</p>
      <div className="mt-4 space-y-3">
        <div className="h-28 animate-pulse rounded-xl bg-chip" />
        <div className="h-28 animate-pulse rounded-xl bg-chip" />
      </div>
    </div>
  );
}

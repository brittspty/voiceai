export default function LeadsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading leads">
      <div className="mb-5 h-8 w-40 rounded-lg bg-hover" />
      <p className="mb-4 text-sm text-muted">Loading leads…</p>
      <div className="space-y-3">
        <div className="h-28 rounded-xl border border-line bg-card" />
        <div className="h-28 rounded-xl border border-line bg-card" />
        <div className="h-28 rounded-xl border border-line bg-card" />
      </div>
    </div>
  );
}

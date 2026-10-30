export default function GoogleAdsConnectionLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="text-sm text-muted">Loading Google Ads status…</p>
      <div className="h-28 animate-pulse rounded-xl border border-line bg-card" />
      <div className="h-40 animate-pulse rounded-xl border border-line bg-card" />
      <div className="h-24 animate-pulse rounded-xl border border-line bg-card" />
    </div>
  );
}

"use client";

export function CopyAmount({ amount, label }: { amount: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-semibold text-ink"
      onClick={() => {
        void navigator.clipboard?.writeText(amount);
      }}
    >
      Copy number
    </button>
  );
}

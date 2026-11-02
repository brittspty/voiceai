import type { ConsentSelection } from "@/lib/consent/onboarding";

const STATUS = {
  installed: "Installed",
  detected: "Detected",
  missing: "Not detected yet",
} as const;

export function ConsentOnboardingPanel({ selection }: { selection: ConsentSelection }) {
  if (!selection.required) return null;
  return (
    <section aria-label="Consent pop-up" className="mb-6 rounded-xl border border-line bg-canvas p-4">
      <h2 className="text-base font-semibold">Consent pop-up</h2>
      <p className="mt-1 text-sm text-muted">Required for every client website. It is already selected and cannot be skipped or unchecked.</p>
      <ul className="mt-3 space-y-2">
        {selection.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex min-h-11 items-center gap-2 font-medium">
              <input type="checkbox" defaultChecked disabled name="consent-popup" value={item.id} />
              {item.label}
              <span className="font-normal text-muted">· {item.website}</span>
            </label>
            <span>{STATUS[item.status]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">Paste this as the first thing in the head of each client website, before other tags.</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-card p-3 text-xs">{selection.snippet}</pre>
    </section>
  );
}

import { CONSENT_COPY, CONSENT_WORDING_VERSION, draftBanner, wordingHash } from "@/lib/consent/copy";

export function ConsentDraftPreview() {
  const copy = CONSENT_COPY;
  const rows = [
    [copy.lowTitle, copy.lowBody],
    [copy.mediumTitle, copy.mediumBody],
    [copy.highTitle, copy.highBody],
    [copy.rejectTitle, copy.rejectBody],
  ];
  return (
    <section aria-label="Consent wording preview" className="rounded-2xl border border-line bg-card p-4">
      <p className="mb-3 inline-flex rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold" data-consent-draft="true">
        {draftBanner()}
      </p>
      <h2 className="text-xl font-semibold">{copy.title}</h2>
      <p className="mt-2 text-sm">{copy.intro}</p>
      <ul className="mt-4 space-y-3 text-sm">
        {rows.map(([title, body]) => (
          <li key={title}>
            <b>{title}.</b> {body}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">{copy.change}</p>
      <p className="mt-2 text-sm">{copy.withdraw}</p>
      <p className="mt-4 text-xs text-muted">{copy.footnote}</p>
      <p className="mt-3 text-xs text-muted">Wording version {CONSENT_WORDING_VERSION}. Hash {wordingHash().slice(0, 12)}.</p>
    </section>
  );
}

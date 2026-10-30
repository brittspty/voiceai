"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveLeadValueAction } from "@/lib/marketing/lead-value-action";

export function LeadValueForm({
  initialLead = "",
  initialCall = "",
  submitLabel,
  skipHref,
  backHref,
  next,
  byline,
  onSaved,
}: {
  initialLead?: string;
  initialCall?: string;
  submitLabel: string;
  skipHref?: string;
  backHref?: string;
  next?: string;
  byline?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(form: HTMLFormElement) {
    setPending(true);
    setError("");
    const result = await saveLeadValueAction(new FormData(form));
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onSaved?.();
    if (next) router.push(next);
    else router.refresh();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      {next && <input type="hidden" name="next" value={next} />}
      <label className="mb-3.5 flex flex-col gap-1 font-medium">
        Value per lead (USD)
        <input name="lead" inputMode="decimal" defaultValue={initialLead} required className="min-h-11 rounded-[10px] border border-line px-3 font-normal" />
      </label>
      <label className="mb-3.5 flex flex-col gap-1 font-medium">
        Value per call (optional)
        <input name="call" inputMode="decimal" defaultValue={initialCall} className="min-h-11 rounded-[10px] border border-line px-3 font-normal" />
        <small className="font-normal text-muted">Leave blank to use the lead value for calls.</small>
      </label>
      {byline && <p className="mb-3 text-[13px] text-muted">{byline}</p>}
      <p className="mb-2 min-h-4 text-xs text-danger" role="alert">{error}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backHref ? (
          <a className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-card px-4 font-semibold" href={backHref}>← Back</a>
        ) : (
          <span />
        )}
        <span className="flex flex-wrap items-center gap-2">
          {skipHref && (
            <a className="inline-flex min-h-11 items-center px-2 font-semibold text-info underline" href={skipHref}>Skip for now (ROAS stays hidden)</a>
          )}
          <button
            type="button"
            className="min-h-11 rounded-[10px] bg-ink px-4 font-semibold text-on-ink disabled:opacity-60"
            disabled={pending}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) void save(form);
            }}
          >
            {pending ? "Saving" : submitLabel}
          </button>
        </span>
      </div>
    </form>
  );
}

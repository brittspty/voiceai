"use client";

import { useEffect, useId, useRef, useState } from "react";

export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel,
  action,
  danger = false,
  className = "text-sm underline",
}: {
  label: string;
  title: string;
  body: string;
  confirmLabel?: string;
  action: () => Promise<void>;
  danger?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => { setError(null); setOpen(true); }}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={() => setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button ref={cancelRef} type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => setOpen(false)}>Cancel</button>
              <button
                type="button"
                disabled={pending}
                className={`h-10 rounded-full px-4 text-sm ${danger ? "bg-danger text-on-ink" : "btn-brand"}`}
                onClick={async () => {
                  setPending(true);
                  setError(null);
                  try {
                    await action();
                    setOpen(false);
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Something went wrong. Try again.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Working…" : confirmLabel || label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ConfirmSubmitButton({
  label,
  title,
  body,
  name,
  value,
  className,
}: {
  label: string;
  title: string;
  body: string;
  name?: string;
  value?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" className={className || "btn-brand rounded-full px-3 py-1.5 text-sm"} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={() => setOpen(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button ref={cancelRef} type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" name={name} value={value} className="btn-brand h-10 rounded-full px-4 text-sm">{label}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

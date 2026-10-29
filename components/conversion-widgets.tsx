"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decideConversionTurnOn } from "@/lib/marketing/offline/actions";
import { undoToast } from "@/lib/marketing/offline/decision";

export function ConnectLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="btn-brand inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm"
      onClick={(event) => {
        const popup = window.open(href, "voiceops-connect", "popup,width=480,height=720");
        if (popup) event.preventDefault();
      }}
    >
      {label}
    </a>
  );
}

export function ErrorDrawer({
  count,
  errors,
  technical,
}: {
  count: number;
  errors: { code: string; cause: string; fix: string }[];
  technical: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  if (!count) return null;
  return (
    <>
      <button type="button" className="min-h-11 text-sm font-medium text-brand-ink underline" onClick={() => ref.current?.showModal()}>
        Errors ({count})
      </button>
      <dialog ref={ref} className="w-[min(100%,32rem)] rounded-xl border border-line bg-card p-0 text-ink backdrop:bg-overlay max-sm:fixed max-sm:inset-0 max-sm:m-0 max-sm:h-full max-sm:max-h-full max-sm:w-full max-sm:max-w-none max-sm:rounded-none">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold">Errors ({count})</h2>
          <button type="button" className="min-h-11 px-3 text-sm" onClick={() => ref.current?.close()}>Close</button>
        </div>
        <div className="space-y-4 px-4 py-4">
          {errors.map((error) => (
            <article key={error.code}>
              <p>{error.cause}</p>
              <p className="mt-1 text-sm text-muted">Fix: {error.fix}</p>
            </article>
          ))}
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(technical);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            Copy technical details
          </button>
          {copied && <p role="status" aria-live="polite" className="text-sm">Copied the error codes.</p>}
          <pre className="overflow-x-auto rounded-lg bg-canvas p-3 text-xs">{technical || "No technical details"}</pre>
        </div>
      </dialog>
    </>
  );
}

export function UndoToast({ undoUntil, clientId, decisionId }: { undoUntil: string; clientId: string; decisionId: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => Math.ceil((Date.parse(undoUntil) - Date.now()) / 1000));
  useEffect(() => {
    const timer = setInterval(() => {
      const next = Math.ceil((Date.parse(undoUntil) - Date.now()) / 1000);
      setLeft(next);
      if (next <= 0) router.refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [undoUntil, router]);
  return (
    <div role="status" aria-live="polite" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-success-soft px-3 py-2 text-sm">
      <span>{undoToast(Math.max(left, 0))}</span>
      {left > 0 && (
        <form action={decideConversionTurnOn}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="decisionId" value={decisionId} />
          <input type="hidden" name="decision" value="undo" />
          <button type="submit" className="min-h-11 underline">Undo</button>
        </form>
      )}
    </div>
  );
}

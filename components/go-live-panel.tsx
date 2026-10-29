"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { GO_LIVE_GROUPS, goLiveProgress, presentGoLiveItem } from "@/lib/customer-copy";
import { updateSwitches } from "@/lib/actions";
import type { ReadinessItem } from "@/lib/readiness";

const TONE = {
  done: "bg-success-soft text-success",
  todo: "bg-amber-100 text-amber-950",
  staff: "bg-zinc-100 text-zinc-700",
};

export function GoLivePanel({
  owner,
  showAdmin,
  canAct,
  testMode,
  items,
  cap,
  windowLabel,
  switches,
}: {
  owner: boolean;
  showAdmin: boolean;
  canAct: boolean;
  testMode: boolean;
  items: ReadinessItem[];
  cap: number;
  windowLabel: string;
  switches: { requireConsent: boolean; enforceDnc: boolean; enforceCallingHours: boolean; scheduleEnabled: boolean };
}) {
  const router = useRouter();
  const progress = goLiveProgress(items);
  const rows = items.filter((item) => item.id !== "test-mode").map(presentGoLiveItem);
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function save(nextTestMode: boolean) {
    setPending(true);
    setError(null);
    try {
      await updateSwitches({ ...switches, testMode: nextTestMode, confirm: nextTestMode ? undefined : phrase });
      setOpen(false);
      setConfirmBack(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update test mode.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-line bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <p className="font-medium">{progress.done} of {progress.total} done.{progress.remaining === 0 ? " You can go live." : ` Finish ${progress.remaining} more ${progress.remaining === 1 ? "step" : "steps"} to go live.`}</p>
          <span className="text-muted">{Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-chip" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total} aria-label="Go-live progress">
          <div className="h-2 rounded-full" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`, background: "var(--brand)" }} />
        </div>
      </div>
      <div className="space-y-6">
        {GO_LIVE_GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.group === group);
          if (!groupRows.length) return null;
          return (
            <section key={group}>
              <h2 className="mb-2 text-sm font-semibold">{group}</h2>
              <ul className="space-y-2">
                {groupRows.map((row) => {
                  const state = row.ok ? "Done" : row.handledBySpecificity ? "Needs Specificity" : "To do";
                  const tone = row.ok ? TONE.done : row.handledBySpecificity ? TONE.staff : TONE.todo;
                  return (
                    <li key={row.id} className="rounded-xl border border-line bg-card px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{state}</span>
                            {row.title}
                          </div>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{row.helper}</p>
                          {showAdmin && (
                            <details className="mt-2 text-xs text-muted">
                              <summary>Admin details</summary>
                              <p className="mt-1">{row.adminHint}</p>
                            </details>
                          )}
                        </div>
                        {canAct && !row.ok && row.action && row.href && (
                          <Link href={row.href} className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm">{row.action}</Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {owner && testMode && (
        <div className="mt-4">
          <button
            type="button"
            disabled={progress.remaining !== 0}
            className="btn-brand h-10 rounded-full px-4 text-sm"
            onClick={() => { setPhrase(""); setError(null); setOpen(true); }}
          >
            Go live…
          </button>
        </div>
      )}
      {owner && !testMode && (
        <div className="mt-4">
          <button type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => setConfirmBack(true)}>Switch back to test mode</button>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl">
            <h2 id={titleId} className="text-lg font-semibold">Start calling real leads?</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Avery will call up to <strong className="text-ink">{cap}</strong> leads a day during your calling hours ({windowLabel}). You can switch back to test mode anytime.
            </p>
            <label className="mt-4 block text-sm">
              Type GO LIVE to confirm
              <input ref={inputRef} value={phrase} onChange={(event) => setPhrase(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line px-3" autoComplete="off" />
            </label>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" disabled={phrase !== "GO LIVE" || pending} className="h-10 rounded-full bg-danger px-4 text-sm text-on-ink disabled:opacity-50" onClick={() => save(false)}>
                {pending ? "Working…" : "Go live"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmBack && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-back`} className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl">
            <h2 id={`${titleId}-back`} className="text-lg font-semibold">Switch back to test mode?</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Avery will stop calling real leads. Test calls still work.</p>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => setConfirmBack(false)}>Cancel</button>
              <button type="button" disabled={pending} className="h-10 rounded-full bg-ink px-4 text-sm text-white dark:bg-white dark:text-black" onClick={() => save(true)}>Switch to test mode</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

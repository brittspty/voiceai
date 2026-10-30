"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markLeadContacted, muteLeadForDay, saveSpeedTargetAction, undoLeadContacted } from "@/lib/marketing/speed-actions";
import { EMPTY_LEADS, EMPTY_WAITING, ERROR_COPY, telHref, type SpeedLeadView } from "@/lib/marketing/speed-to-lead";

export type SpeedCard = SpeedLeadView & { landedLabel: string; touchLabel: string };

export function SpeedToLeadScreen({
  cards,
  answered,
  headline,
  withinTargetPercent,
  targetSeconds,
  canMark,
  canEditTarget,
  saved,
  error,
  focus,
}: {
  cards: SpeedCard[];
  answered: SpeedCard[];
  headline: string;
  withinTargetPercent: number | null;
  targetSeconds: number;
  canMark: boolean;
  canEditTarget: boolean;
  saved: boolean;
  error: boolean;
  focus?: SpeedCard | null;
}) {
  const [toast, setToast] = useState<{ id: string; left: number; text: string } | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setInterval(() => {
      setToast((current) => {
        if (!current) return null;
        if (current.left <= 1) return null;
        return { ...current, left: current.left - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [toast]);

  const waiting = focus ? cards.filter((card) => card.id !== focus.id) : cards;
  const noLeads = !cards.length && !answered.length && !focus;

  return (
    <div>
      <p className="text-lg font-semibold">{headline}</p>
      {!focus && (
        <p className="mt-1 text-sm text-muted">
          {withinTargetPercent == null ? "Not enough leads yet to score the target." : `${withinTargetPercent}% answered within the target.`}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm">
          Saved. The target is {targetSeconds} seconds.
        </p>
      )}
      {canEditTarget && (
        <form action={saveSpeedTargetAction} className="mt-4 max-w-sm rounded-xl border border-line bg-card p-4">
          <label htmlFor="targetSeconds" className="text-sm font-medium">
            Response target (seconds)
          </label>
          <p id="target-help" className="mt-1 text-sm text-muted">
            Alert when the first response is slower than this. The starting target is 30 seconds.
          </p>
          <input
            id="targetSeconds"
            name="targetSeconds"
            type="number"
            min={1}
            max={86400}
            required
            defaultValue={targetSeconds}
            aria-describedby="target-help"
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-canvas px-3"
          />
          <button type="submit" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-lg px-4">
            Save target
          </button>
        </form>
      )}
      {error ? (
        <div className="mt-4 rounded-xl border border-line bg-card p-4" role="alert">
          <p>{ERROR_COPY}</p>
          <Link href="/marketing/speed-to-lead" className="btn-brand mt-3 inline-flex min-h-11 items-center rounded-lg px-4">
            Retry
          </Link>
        </div>
      ) : (
        <>
          {focus && (
            <div className="mt-4">
              <SpeedLeadCard card={focus} canMark={canMark} banner onDone={setToast} onProblem={setProblem} />
            </div>
          )}
          {!focus && (
            <>
              <section className="mt-6" aria-labelledby="waiting-heading">
                <h2 id="waiting-heading" className="font-semibold">
                  Waiting now
                </h2>
                {noLeads ? (
                  <p className="mt-2 text-sm text-muted">{EMPTY_LEADS}</p>
                ) : waiting.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{EMPTY_WAITING}</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {waiting.map((card) => (
                      <SpeedLeadCard key={card.id} card={card} canMark={canMark} onDone={setToast} onProblem={setProblem} />
                    ))}
                  </div>
                )}
              </section>
              {answered.length > 0 && (
                <section className="mt-6" aria-labelledby="answered-heading">
                  <h2 id="answered-heading" className="font-semibold">
                    Answered today
                  </h2>
                  <div className="mt-3 space-y-3">
                    {answered.map((card) => (
                      <SpeedLeadCard key={card.id} card={card} canMark={false} onDone={setToast} onProblem={setProblem} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      {problem && (
        <p role="alert" className="mt-4 text-sm">
          {problem}{" "}
          <button type="button" className="min-h-11 underline" onClick={() => setProblem("")}>
            Try again
          </button>
        </p>
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-lg">
            <p>
              Marked contacted. Undo · {toast.left}s
            </p>
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 font-semibold" onClick={() => undo(toast.id, setToast, setProblem)}>
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function undo(id: string, setToast: (value: null) => void, setProblem: (value: string) => void) {
  void undoLeadContacted(id)
    .then(() => setToast(null))
    .catch(() => setProblem("Couldn't undo. The 30 second window may have closed."));
}

function SpeedLeadCard({
  card,
  canMark,
  banner = false,
  onDone,
  onProblem,
}: {
  card: SpeedCard;
  canMark: boolean;
  banner?: boolean;
  onDone: (toast: { id: string; left: number; text: string }) => void;
  onProblem: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const call = telHref(card.phone);
  const late = card.band === "late" || card.band === "very_late";

  function mark() {
    start(async () => {
      try {
        await markLeadContacted(card.id);
        onProblem("");
        onDone({ id: card.id, left: 30, text: "Marked contacted. Undo · 30s" });
        router.refresh();
      } catch {
        onProblem("Couldn't save. Your mark wasn't recorded.");
      }
    });
  }

  return (
    <article className="rounded-xl border border-line bg-card p-4" aria-labelledby={`lead-${card.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md border border-line bg-chip px-2 py-0.5 text-xs font-bold text-ink">Speed-to-lead · {card.bandLabel}</span>
        <span className="text-muted">{card.source}</span>
      </div>
      <h3 id={`lead-${card.id}`} className="mt-2 text-lg font-semibold">
        <Link href={`/marketing/speed-to-lead/${card.id}`} className="inline-flex min-h-11 items-center underline-offset-2 hover:underline">
          {card.name}
        </Link>
      </h3>
      <p role="status" className={banner ? "mt-2 rounded-lg bg-canvas px-3 py-3" : "mt-1"}>
        <span className="sr-only">{card.spoken}.</span>
        <span aria-hidden="true">{card.line}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {card.clockDetail}
        {card.landedLabel ? ` · Landed ${card.landedLabel}` : ""}
        {card.contacted ? ` · ${card.touchLabel}` : ""}
        {card.channelLabel ? ` · ${card.channelLabel}` : ""}
      </p>
      {canMark && card.waiting && (
        <div className="sticky bottom-0 mt-3 flex flex-col gap-2 bg-card py-2 sm:flex-row">
          {call ? (
            <a href={call} className="btn-brand inline-flex min-h-12 items-center justify-center rounded-lg px-4 sm:min-w-36">
              Call now
            </a>
          ) : (
            <button type="button" disabled className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-4 text-muted">
              No phone number
            </button>
          )}
          <button type="button" disabled={pending} onClick={mark} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-4 font-semibold">
            {pending ? "Saving…" : "Mark contacted"}
          </button>
          {late && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm underline"
              onClick={() => {
                start(async () => {
                  try {
                    await muteLeadForDay(card.id);
                    onProblem("");
                    router.refresh();
                  } catch {
                    onProblem("Couldn't save. The mute wasn't recorded.");
                  }
                });
              }}
            >
              Mute this for 24h
            </button>
          )}
        </div>
      )}
    </article>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { TOUR_EXIT_CLASS, moveTour, parseTourEnding, parseTourMode, tourActive, tourBadgeLabel, tourKey, tourLocation, tourStepIndex, type TourCatalog, type TourEnding, type TourMode, type TourStep } from "@/lib/demo/tour";

function stepsFor(catalog: TourCatalog, ending: TourEnding | null) {
  if (ending === "client") return catalog.client;
  if (ending === "investor") return catalog.investor;
  return catalog.open;
}

function useTour(enabled: boolean, catalog: TourCatalog) {
  const params = useSearchParams();
  const ending = parseTourEnding(params.get("ending") ?? undefined);
  const mode = parseTourMode(params.get("tour") ?? undefined);
  const steps = stepsFor(catalog, ending);
  const active = tourActive(enabled, mode);
  const index = tourStepIndex(params.get("step") ?? undefined, steps.length);
  const view: "staff" | "client" = params.get("view") === "client" ? "client" : "staff";
  return { mode: active ? mode : null, index, view, step: steps[index], steps, ending, catalog };
}

export function DemoTourExit({ enabled, catalog }: { enabled: boolean; catalog: TourCatalog }) {
  const { mode, view } = useTour(enabled, catalog);
  if (!mode) return null;
  return (
    <Link href={`/demo?view=${view}`} className={TOUR_EXIT_CLASS}>
      Exit
    </Link>
  );
}

export function DemoTourPanel({ enabled, catalog }: { enabled: boolean; catalog: TourCatalog }) {
  const router = useRouter();
  const { mode, index, view, step, steps, ending } = useTour(enabled, catalog);

  useEffect(() => {
    if (!mode || !step) return;
    const node = document.querySelector(`[data-tour-anchor="${step.anchor}"]`);
    if (!(node instanceof HTMLElement)) return;
    const previous = node.style.outline;
    const offset = node.style.outlineOffset;
    node.style.outline = "3px solid var(--brand)";
    node.style.outlineOffset = "4px";
    return () => {
      node.style.outline = previous;
      node.style.outlineOffset = offset;
    };
  }, [mode, step]);

  useEffect(() => {
    if (!mode || !step) return;
    const currentMode = mode;
    function onKey(event: KeyboardEvent) {
      const action = tourKey(event.key, currentMode);
      if (!action) return;
      event.preventDefault();
      if (action === "exit") {
        router.push(`/demo?view=${view}`);
        return;
      }
      if (action === "next" && step.id === "close") return;
      const next = moveTour(index, action === "next" ? 1 : -1, steps.length);
      router.push(tourLocation(steps[next]!, currentMode, view, next, ending));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, step, index, view, router, steps, ending]);

  if (!mode || !step) return null;
  const counter = `${index + 1} of ${steps.length}`;
  const progress = Math.round(((index + 1) / steps.length) * 100);

  if (mode === "self") {
    return (
      <aside className="fixed inset-x-3 bottom-3 z-30 max-h-[50vh] overflow-auto rounded-2xl border border-line bg-card p-4 shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:w-80" aria-label="Guide">
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-chip" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
          <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs font-semibold text-muted">{counter}</p>
        <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
        <p className="mt-2 text-sm leading-6">{step.body}</p>
        <p className="mt-3 text-xs font-semibold">{tourBadgeLabel(step.badge)}</p>
        <TourMoves router={router} mode={mode} view={view} index={index} steps={steps} ending={ending} catalog={catalog} choosing={step.id === "close"} showSwitch={step.id === "client" || step.id === "investor"} />
        <button type="button" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline" onClick={() => router.push(`/demo?view=${view}`)}>
          Dismiss
        </button>
      </aside>
    );
  }

  return (
    <section className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-auto border-t-4 border-brand bg-card px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8" aria-label="Presenter">
      <p className="text-sm font-semibold text-muted">{counter}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{step.title}</h2>
      <p className="mt-3 max-w-3xl text-lg leading-8">{step.body}</p>
      <p className="mt-4 text-sm font-semibold">{tourBadgeLabel(step.badge)}</p>
      <TourMoves router={router} mode={mode} view={view} index={index} steps={steps} ending={ending} catalog={catalog} choosing={step.id === "close"} showSwitch={step.id === "client" || step.id === "investor"} />
    </section>
  );
}

function TourMoves({
  router,
  mode,
  view,
  index,
  steps,
  ending,
  catalog,
  choosing,
  showSwitch,
}: {
  router: ReturnType<typeof useRouter>;
  mode: TourMode;
  view: "staff" | "client";
  index: number;
  steps: TourStep[];
  ending: TourEnding | null;
  catalog: TourCatalog;
  choosing: boolean;
  showSwitch: boolean;
}) {
  const back = moveTour(index, -1, steps.length);
  const next = moveTour(index, 1, steps.length);
  const last = catalog.client.length - 1;
  const clientStep = catalog.client[last];
  const investorStep = catalog.investor[last];
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold" onClick={() => router.push(tourLocation(steps[back]!, mode, view, back, ending))}>
        Back
      </button>
      {choosing && clientStep && investorStep ? (
        <>
          <button type="button" className="btn-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm" onClick={() => router.push(tourLocation(clientStep, mode, view, last, "client"))}>
            Client ending
          </button>
          <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold" onClick={() => router.push(tourLocation(investorStep, mode, view, last, "investor"))}>
            Investor ending
          </button>
        </>
      ) : null}
      {!choosing && next !== index ? (
        <button type="button" className="btn-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm" onClick={() => router.push(tourLocation(steps[next]!, mode, view, next, ending))}>
          Next
        </button>
      ) : null}
      {showSwitch && ending && clientStep && investorStep ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold underline"
          onClick={() => router.push(tourLocation(ending === "client" ? investorStep : clientStep, mode, view, last, ending === "client" ? "investor" : "client"))}
        >
          {ending === "client" ? "Switch to investor ending" : "Switch to client ending"}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { LeadRowView } from "@/lib/marketing/lead-score/present";
import { automaticScoreText, choiceLabel, manualMarkText } from "@/lib/marketing/lead-score/summary";
import type { LeadLabel } from "@/lib/marketing/lead-score/types";

type Audience = "owner" | "staff" | "readonly";
type Mark = "qualified" | "unqualified" | "spam" | "clear";

const REASONS = ["Wrong area", "Price shopper", "Spam", "Already a customer"] as const;
const FILTERS = [
  { value: "", label: "All" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Not qualified" },
  { value: "spam", label: "Spam" },
  { value: "unmarked", label: "Not sure yet" },
];

function optionsFor(audience: Audience) {
  if (audience === "owner") {
    return [
      { mark: "qualified" as const, label: "Qualified" },
      { mark: "unqualified" as const, label: "Not qualified" },
    ];
  }
  return [
    { mark: "qualified" as const, label: "Qualified" },
    { mark: "unqualified" as const, label: "Not a fit" },
    { mark: "clear" as const, label: "Not sure yet" },
  ];
}

function selectedMark(row: LeadRowView, cleared: Set<string>): Mark | null {
  if (row.manualLabel === "qualified") return "qualified";
  if (row.manualLabel === "unqualified" || row.manualLabel === "spam") return "unqualified";
  if (cleared.has(row.id)) return "clear";
  return null;
}

export function LeadBoard({
  rows,
  audience,
  filter,
  exampleData,
  mode = "list",
}: {
  rows: LeadRowView[];
  audience: Audience;
  filter: string;
  exampleData: boolean;
  mode?: "list" | "detail";
}) {
  const [items, setItems] = useState(rows);
  const toastSerial = useRef(0);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<{ ids: string[]; mark: Mark; reason: string } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; left: number; undo: () => void } | null>(null);
  const canMark = audience !== "readonly";
  const options = optionsFor(audience);
  const visible = items.filter((row) => {
    if (!filter) return true;
    if (filter === "unmarked") return !row.manualLabel;
    return row.effectiveLabel === filter;
  });

  const toastId = toast?.id ?? 0;
  useEffect(() => {
    if (!toastId) return;
    const timer = setInterval(() => {
      setToast((current) => {
        if (!current || current.id !== toastId) return current;
        if (current.left <= 1) return null;
        return { ...current, left: current.left - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [toastId]);

  async function send(ids: string[], mark: Mark, reason = "") {
    const response = await fetch("/api/marketing/leads/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, mark, reason }),
    });
    if (!response.ok) throw new Error("save failed");
    const body = (await response.json()) as {
      rows: { id: string; manualLabel: LeadLabel | null; manualReason: string; manualBy: string; manualAt: string | null; effectiveLabel: LeadLabel }[];
    };
    return body.rows;
  }

  async function apply(ids: string[], mark: Mark, reason = "") {
    const before = items.filter((row) => ids.includes(row.id)).map((row) => ({ ...row }));
    setError("");
    setRetry(null);
    setItems((current) =>
      current.map((row) => {
        if (!ids.includes(row.id)) return row;
        const manualLabel = mark === "clear" ? null : mark;
        return { ...row, manualLabel, manualReason: reason, effectiveLabel: manualLabel ?? row.automaticLabel };
      }),
    );
    if (mark === "clear") setCleared((current) => new Set([...current, ...ids]));
    else setCleared((current) => new Set([...current].filter((id) => !ids.includes(id))));
    try {
      const saved = await send(ids, mark, reason);
      setItems((current) =>
        current.map((row) => {
          const next = saved.find((item) => item.id === row.id);
          return next ? { ...row, ...next } : row;
        }),
      );
      const label = mark === "clear" ? "not sure yet" : choiceLabel(mark, audience === "owner" ? "owner" : "staff").toLowerCase();
      toastSerial.current += 1;
      setToast({
        id: toastSerial.current,
        text: `Marked ${label}.`,
        left: 30,
        undo: () => {
          void restore(before);
        },
      });
    } catch {
      setItems((current) => current.map((row) => before.find((item) => item.id === row.id) ?? row));
      setRetry({ ids, mark, reason });
      setError("Couldn't save. Your mark wasn't recorded.");
    }
  }

  async function restore(snapshot: LeadRowView[]) {
    setToast(null);
    try {
      for (const row of snapshot) {
        const mark: Mark = row.manualLabel ?? "clear";
        await send([row.id], mark, row.manualReason);
      }
      setItems((current) => current.map((row) => snapshot.find((item) => item.id === row.id) ?? row));
    } catch {
      setError("Couldn't save. Your mark wasn't recorded.");
    }
  }

  function onArrows(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (!buttons.length) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(Math.max(index, 0) + delta + buttons.length) % buttons.length];
    next?.focus();
  }

  return (
    <div>
      {exampleData && (
        <div className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm font-semibold">EXAMPLE DATA</div>
      )}
      {mode === "list" && (
        <div className="mb-4 flex flex-wrap gap-2" role="navigation" aria-label="Filter leads">
          {FILTERS.map((item) => {
            const label = item.value === "unqualified" && audience === "staff" ? "Not a fit" : item.label;
            const href = item.value ? `/marketing/leads?quality=${item.value}` : "/marketing/leads";
            const active = filter === item.value;
            return (
              <Link key={item.value || "all"} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${active ? "btn-brand border-transparent" : "border-line bg-card"}`}>
                {label}
              </Link>
            );
          })}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-line bg-card px-4 py-3 text-sm" role="alert">
          <p>{error}</p>
          {retry && (
            <button type="button" className="mt-2 min-h-11 underline" onClick={() => apply(retry.ids, retry.mark, retry.reason)}>
              Try again
            </button>
          )}
        </div>
      )}
      {visible.length === 0 && (
        <div className="rounded-xl border border-line bg-card p-6 text-sm text-muted">
          {items.length === 0 ? "No leads yet. They appear here as soon as your form or calls bring one in." : "No leads in this view."}
        </div>
      )}
      <div className="space-y-3">
        {visible.map((row) => {
          const chosen = selectedMark(row, cleared);
          return (
            <article key={row.id} className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
              <div className="flex items-start gap-3">
                {canMark && mode === "list" && (
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={selected.includes(row.id)}
                    aria-label={`Select ${row.name}`}
                    onChange={(event) => {
                      setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)));
                    }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {mode === "list" ? (
                    <Link href={`/marketing/leads/${row.id}`} className="text-base font-semibold underline">
                      {row.name}
                    </Link>
                  ) : (
                    <h2 className="text-base font-semibold">{row.name}</h2>
                  )}
                  <p className="text-sm text-muted">
                    {row.kind === "form" ? "Form" : "Call"}
                    {row.detail ? ` · ${row.detail}` : ""}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Automatic score.</span> {automaticScoreText(row.automaticLabel, row.automaticScore)}
                    {row.model === "rules" ? "" : ` · ${row.model}`}
                  </p>
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer underline">Why?</summary>
                    <p className="mt-1 text-muted">{row.automaticReason}</p>
                  </details>
                  {row.manualLabel && row.manualAt && (
                    <p className="mt-3 text-sm font-medium">{manualMarkText(row.manualLabel, row.manualBy || "Staff", formatDateTime(row.manualAt))}</p>
                  )}
                  {mode === "detail" && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium">{row.kind === "call" ? "Transcript" : "Form"}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{row.transcript || row.email || "No transcript yet."}</p>
                    </div>
                  )}
                  {canMark && (
                    <div className="mt-3 w-full sm:max-w-xl">
                      <div role="radiogroup" aria-label={`Quality for ${row.name}`} className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3" onKeyDown={onArrows}>
                        {options.map((option, index) => {
                          const checked = chosen === option.mark;
                          return (
                            <button
                              key={option.mark}
                              type="button"
                              role="radio"
                              aria-checked={checked}
                              tabIndex={checked || (!chosen && index === 0) ? 0 : -1}
                              className={`min-h-11 rounded-full px-3 text-sm ${checked ? "btn-brand" : "border border-line bg-card"}`}
                              onClick={() => apply([row.id], option.mark, option.mark === "unqualified" ? "" : "")}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {audience === "staff" && chosen === "unqualified" && (
                        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Reason">
                          {REASONS.map((reason) => {
                            const active = reason === "Spam" ? row.manualLabel === "spam" : row.manualReason === reason;
                            return (
                              <button
                                key={reason}
                                type="button"
                                aria-pressed={active}
                                className={`min-h-11 rounded-full border px-3 text-sm ${active ? "btn-brand border-transparent" : "border-line"}`}
                                onClick={() => apply([row.id], reason === "Spam" ? "spam" : "unqualified", reason === "Spam" ? "Spam" : reason)}
                              >
                                {reason}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {canMark && selected.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap gap-2 rounded-xl border border-line bg-card p-3 shadow-[var(--shadow)]">
          <span className="self-center text-sm">{selected.length} selected</span>
          {options.map((option) => (
            <button key={option.mark} type="button" className="btn-brand min-h-11 rounded-full px-3 text-sm" onClick={() => apply(selected, option.mark)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite" className="mt-4 min-h-11">
        {toast && (
          <p className="text-sm">
            {toast.text}{" "}
            <button type="button" className="min-h-11 underline" onClick={toast.undo}>
              Undo · {toast.left}s
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

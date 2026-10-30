"use client";

import { useState } from "react";
import { saveSearchChoices } from "@/lib/marketing/feature-actions";
import { groupProposals, type ProposalView } from "@/lib/marketing/search-waste";

export function SearchWasteBatch({ rows, seesCost }: { rows: ProposalView[]; seesCost: boolean }) {
  const [choice, setChoice] = useState<Record<string, "block" | "keep">>(() => Object.fromEntries(rows.map((row) => [row.id || row.term, row.defaultAction])));
  const [match, setMatch] = useState<Record<string, "exact" | "phrase">>(() => Object.fromEntries(rows.map((row) => [row.id || row.term, row.matchType])));
  const [anchor, setAnchor] = useState(0);
  const groups = groupProposals(rows);
  const flat = groups.flatMap((group) => group.rows);
  const blocked = flat.filter((row) => choice[row.id || row.term] === "block");

  function setRange(index: number, next: "block" | "keep") {
    const [start, end] = anchor < index ? [anchor, index] : [index, anchor];
    setChoice((current) => {
      const copy = { ...current };
      for (let i = start; i <= end; i += 1) {
        const key = flat[i].id || flat[i].term;
        copy[key] = next;
      }
      return copy;
    });
  }

  function toggle(index: number, shift: boolean) {
    const key = flat[index].id || flat[index].term;
    if (shift) {
      const next = choice[key] === "block" ? "keep" : "block";
      setRange(index, next);
      return;
    }
    setAnchor(index);
    setChoice((current) => ({ ...current, [key]: current[key] === "block" ? "keep" : "block" }));
  }

  const params = new URLSearchParams();
  for (const row of blocked) {
    const key = row.id || "";
    if (!key) continue;
    params.append("id", key);
    params.append("match", `${key}:${match[key] || "phrase"}`);
  }
  const exportUrl = `/api/marketing/search-waste/export?${params.toString()}`;

  return (
    <div className="space-y-4 pb-24">
      <p className="text-sm text-muted">Download the CSV and add the negatives in Google Ads. This app does not change the ad account.</p>
      {groups.map((group) => (
        <section key={group.reason} className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold">{group.label}</h2>
          <ul className="mt-3 space-y-2">
            {group.rows.map((row) => {
              const key = row.id || row.term;
              const index = flat.findIndex((item) => (item.id || item.term) === key);
              const selected = choice[key] === "block";
              return (
                <li key={key} className="rounded-lg border border-line p-3">
                  <button
                    type="button"
                    aria-pressed={selected}
                    className="min-h-11 w-full rounded-lg px-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={(event) => toggle(index, event.shiftKey)}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Spacebar") {
                        event.preventDefault();
                        toggle(index, event.shiftKey);
                      }
                    }}
                  >
                    <span className="font-medium">{row.term}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {selected ? "Block" : "Keep"} · {row.clicks.toLocaleString("en-US")} clicks
                      {seesCost && row.spend !== undefined ? ` · ${row.spend.toLocaleString("en-US", { style: "currency", currency: row.currency || "USD" })}` : ""}
                      {" · "}
                      {row.confidence === "high" ? "High confidence" : row.confidence === "medium" ? "Medium confidence" : "Low confidence"}
                    </span>
                    {row.safetyNote ? <span className="mt-1 block text-sm">Warning: {row.safetyNote}</span> : null}
                  </button>
                  <label className="mt-2 block text-sm">
                    Match type
                    <select
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2"
                      value={match[key] || "phrase"}
                      onChange={(event) => setMatch((current) => ({ ...current, [key]: event.target.value === "exact" ? "exact" : "phrase" }))}
                    >
                      <option value="phrase">Phrase</option>
                      <option value="exact">Exact</option>
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-line bg-canvas py-3">
        <a className={`inline-flex min-h-11 items-center rounded-lg px-4 font-semibold ${blocked.length ? "bg-brand text-on-brand" : "pointer-events-none bg-card text-muted"}`} href={blocked.length ? exportUrl : undefined} aria-disabled={blocked.length === 0}>
          Download {blocked.length} for Google Ads
        </a>
        <form action={saveSearchChoices}>
          {flat.map((row) => {
            const key = row.id || row.term;
            const picked = choice[key] === "block" ? "block" : "keep";
            return <input key={key} type="hidden" name={picked} value={key} />;
          })}
          <button className="min-h-11 rounded-lg border border-line bg-card px-4 font-semibold text-ink" type="submit">Save choices</button>
        </form>
      </div>
    </div>
  );
}

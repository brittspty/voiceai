"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_TAGLINE, BRAND_WORDMARK, PRODUCT_NAME } from "@/lib/brand";
import { answerDecision, seesInboxCard, type DecisionViewer, type InboxCard } from "@/lib/marketing/channels/decisions";
import { autoPauseState } from "@/lib/marketing/channels/decisions";
import { EXAMPLE_DECISIONS } from "@/lib/marketing/channels/catalog";
import { End } from "./bits";

export function DecisionsInbox({ selectedId, viewer }: { selectedId?: string; viewer: DecisionViewer }) {
  const visible = useMemo(() => EXAMPLE_DECISIONS.filter((card) => seesInboxCard(card, viewer)), [viewer]);
  const [current, setCurrent] = useState(selectedId || visible[0]?.id || "");
  const [cards, setCards] = useState(visible);
  const [undo, setUndo] = useState<{ id: string; previous: InboxCard; left: number } | null>(null);
  const [tab, setTab] = useState("waiting");

  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`decision-${selectedId}`)?.focus();
  }, [selectedId]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => {
      setUndo((row) => {
        if (!row || row.left <= 1) return null;
        return { ...row, left: row.left - 1 };
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const act = useCallback((answer: "yes" | "no" | "later" | "made_change") => {
    const card = cards.find((row) => row.id === current);
    if (!card || viewer.kind === "client_viewer") return;
    const result = answerDecision(card, answer);
    if (result.executes || result.writePath) return;
    setCards((rows) => rows.map((row) => (row.id === card.id ? { ...row, status: result.status } : row)));
    setUndo({ id: card.id, previous: card, left: 30 });
  }, [cards, current, viewer.kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const index = cards.findIndex((card) => card.id === current);
      if (event.key === "j" || event.key === "k") {
        const next = cards[index + (event.key === "j" ? 1 : -1)];
        if (next) setCurrent(next.id);
      }
      if (event.key === "a") act("yes");
      if (event.key === "d") act("no");
      if (event.key === "l") act("later");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, cards, current]);

  const shown = cards.filter((card) => (tab === "waiting" ? card.status === "waiting" : tab === "done" ? card.status === "done" || card.status === "accepted" : true));
  const card = cards.find((row) => row.id === current) ?? shown[0];
  const pause = card?.kind === "page_alert" ? autoPauseState() : null;

  return (
    <main>
      <div className="top">
        <div>
          <div className="sub">Every channel, every client</div>
          <h1>Decisions</h1>
        </div>
        <div className="ctl">
          <span className="ex">EXAMPLE DATA</span>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {["waiting", "assigned", "done", "alerts"].map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
            {name === "waiting" ? `Waiting (${cards.filter((row) => row.status === "waiting").length})` : name === "assigned" ? "Assigned to me" : name === "done" ? "Done this week" : "Alerts"}
          </button>
        ))}
      </div>
      <div className="inb">
        <ul>
          {shown.map((row) => (
            <li key={row.id}>
              <button type="button" className={row.id === card?.id ? "row on" : "row"} onClick={() => setCurrent(row.id)}>
                <span className="tag">{row.kind.replaceAll("_", " ")} · {row.clientName}</span>
                <b>{row.title}</b>
                <span className="sub">Confidence {row.confidence}%</span>
              </button>
            </li>
          ))}
        </ul>
        {card && (
          <section className="det" id={`decision-${card.id}`} tabIndex={-1} aria-label="Decision detail">
            <div className="tag">{card.clientName}</div>
            <h2>{card.title}</h2>
            <p>{card.reasoning}</p>
            {pause && <div className="pend"><b>{pause.copy}</b> Resume after two good checks is pending confirmation.</div>}
            {card.steps.length > 0 && (
              <>
                <h2 style={{ marginTop: 16 }}>Steps for you</h2>
                <ol>{card.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </>
            )}
            <div className="acts">
              {card.kind === "budget_recommendation" || card.kind === "pacing_recommendation" ? (
                <button type="button" className="btn p" onClick={() => act("made_change")}>I made the change</button>
              ) : (
                <button type="button" className="btn p" onClick={() => act("yes")}>Approve</button>
              )}
              <button type="button" className="btn" onClick={() => act("no")}>Decline</button>
              <button type="button" className="btn" onClick={() => act("later")}>Later</button>
            </div>
            <p className="sub" style={{ marginTop: 14 }}>Keyboard: J/K to move, A approve, D decline, L later. Every tap can be undone for 30 seconds.</p>
          </section>
        )}
      </div>
      {undo && (
        <div className="toast" role="status">
          Saved. <button type="button" onClick={() => { setCards((rows) => rows.map((row) => (row.id === undo.id ? undo.previous : row))); setUndo(null); }}>Undo ({undo.left}s)</button>
        </div>
      )}
      <End productName={PRODUCT_NAME} wordmark={BRAND_WORDMARK} tagline={BRAND_TAGLINE} />
    </main>
  );
}

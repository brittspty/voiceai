"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { glossaryEntry } from "@/lib/marketing/channels/glossary";
import type { AdRecommendation } from "@/lib/marketing/channels/recommend";

export function Tip({ glossaryId }: { glossaryId: string }) {
  const entry = glossaryEntry(glossaryId);
  const reactId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!entry) return null;
  const tipId = `tip-${reactId}`;
  return (
    <span className={`tip${open ? " show" : ""}`}>
      <button
        type="button"
        aria-label={`${entry.label} definition`}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={tipId}>
          {entry.definition} <b>{entry.direction}.</b>
        </span>
      )}
    </span>
  );
}

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} style={{ display: "contents" }}>
            {index > 0 && <span className="sep">›</span>}
            {last || !item.href ? (
              <b aria-current={last ? "page" : undefined}>{item.label}</b>
            ) : (
              <a href={item.href}>{item.label}</a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function Tile({
  glossaryId,
  label,
  value,
  prior,
  priorGood,
  goal,
  why,
  staff,
  hero,
}: {
  glossaryId: string;
  label: string;
  value: string;
  prior: string;
  priorGood: boolean;
  goal: string;
  why: string;
  staff?: boolean;
  hero?: boolean;
}) {
  return (
    <div className={hero ? "m hero" : "m"}>
      <div className="lab">
        {label} <Tip glossaryId={glossaryId} /> {staff && <span className="lock">STAFF</span>}
      </div>
      <div className="v">{value}</div>
      <div className={priorGood ? "d-up" : "d-dn"}>{prior}</div>
      <div className="sub">{goal}</div>
      <p className="why">{why}</p>
    </div>
  );
}

export function Flag({ tone, label, children, href }: { tone: "an" | "op" | "oo"; label: string; children: ReactNode; href: string }) {
  return (
    <article className={`flag ${tone}`}>
      <span className="fk">{tone === "an" ? "▼ " : tone === "oo" ? "◆ " : "▲ "}{label}</span>
      <div>{children}</div>
      <a href={href}>Decision →</a>
    </article>
  );
}

export function RecChip({ rec }: { rec: AdRecommendation }) {
  if (rec.action === "insufficient") return <span className="sub">Not enough data</span>;
  const klass = rec.action === "serve" ? "sv" : rec.action === "rotate" ? "rt" : "pa";
  return (
    <div className="rec">
      <span className={`rc ${klass}`}>{rec.action === "serve" ? "● " : rec.action === "rotate" ? "↻ " : "Ⅱ "}{rec.label}</span>
      <span>{rec.reason}</span>
      <span className="cw">{rec.confidenceLabel} · {rec.creditWindowLabel}</span>
      {rec.decisionId && <a href={`/decisions/${rec.decisionId}`}>Open decision →</a>}
    </div>
  );
}

export function End({ productName, wordmark, tagline }: { productName: string; wordmark: string; tagline: string }) {
  return (
    <div className="foottag">
      <span>
        {productName} by {wordmark} · <i>{tagline}</i>
      </span>
      <span>All figures are EXAMPLE DATA</span>
    </div>
  );
}

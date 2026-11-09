"use client";

import { useState } from "react";
import { BASED_ON_LABEL, HUMANS_CONTROL_BUDGETS } from "@/lib/demo/tour";

export function DemoBudgetMoment({
  title,
  detail,
  basedOn,
  field,
  blocked,
  message,
}: {
  title: string;
  detail: string;
  basedOn: string;
  field: string;
  blocked: boolean;
  message: string;
}) {
  const [choice, setChoice] = useState<"pending" | "approved" | "declined">("pending");
  return (
    <article className="rounded-2xl border-2 border-brand bg-card p-5" data-budget-lock={blocked ? "blocked" : "open"}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Bot attempt</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-6">{detail}</p>
      <p className="mt-3 text-sm font-semibold">{BASED_ON_LABEL} {basedOn}</p>
      <div className="mt-4 rounded-xl bg-warning-soft px-4 py-3">
        <p className="text-sm font-semibold">{blocked ? "Blocked. The bot cannot send this." : "The lock did not fire."}</p>
        <p className="mt-1 text-sm">Field the bot tried to write: {field}</p>
        <p className="mt-2 font-mono text-sm leading-6">{message}</p>
      </div>
      <p className="mt-4 text-sm font-semibold">{HUMANS_CONTROL_BUDGETS}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm" onClick={() => setChoice("approved")}>
          Approve
        </button>
        <button type="button" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold" onClick={() => setChoice("declined")}>
          Decline
        </button>
      </div>
      {choice === "approved" ? (
        <p className="mt-3 text-sm leading-6" role="status">You approved the recommendation. The bot did not send it. This demo does not change a platform setting.</p>
      ) : null}
      {choice === "declined" ? (
        <p className="mt-3 text-sm leading-6" role="status">You declined it. Nothing was sent.</p>
      ) : null}
      {choice === "pending" ? <p className="mt-3 text-sm text-muted">Waiting for a person. The buttons do not spend.</p> : null}
    </article>
  );
}

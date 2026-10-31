"use client";

import { useState } from "react";

export function RecommendationSlip({
  illustrative,
  title,
  body,
  why,
}: {
  illustrative: string;
  title: string;
  body: string;
  why: string;
}) {
  const [choice, setChoice] = useState<"approve" | "decline" | null>(null);

  return (
    <div className="slip" aria-label="Illustrative recommendation">
      <div className="k mono">
        <span>RECOMMENDATION</span>
        <span>{illustrative}</span>
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="why mono">{why}</div>
      <div className="acts">
        <button type="button" className="btn" aria-pressed={choice === "approve"} onClick={() => setChoice("approve")}>
          Approve
        </button>
        <button type="button" className="btn sec" aria-pressed={choice === "decline"} onClick={() => setChoice("decline")}>
          Decline
        </button>
      </div>
      {choice ? (
        <p className="slip-status" role="status">
          Noted in this example only. No budget was changed.
        </p>
      ) : null}
    </div>
  );
}

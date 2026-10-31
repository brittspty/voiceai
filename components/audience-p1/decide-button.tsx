"use client";

import { useState } from "react";

export function DecideButtons({
  testId,
  status,
  onHold,
  canCut,
}: {
  testId: string;
  status: string;
  onHold: boolean;
  canCut: boolean;
}) {
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState("");

  const send = async (action: "scale" | "cut") => {
    setError("");
    const response = await fetch("/api/marketing/audience-p1/tests/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId, action }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not log that");
      setSteps([]);
      return;
    }
    setSteps(data.manualSteps || []);
  };

  const scaleReady = status === "winner" && !onHold;
  return (
    <div>
      <p className="muted">No write access approved. This only logs the choice.</p>
      <button type="button" className="ap-hit" disabled={!scaleReady} onClick={() => void send("scale")}>Scale</button>
      <button type="button" className="ap-hit" disabled={!canCut || status === "stopped"} onClick={() => void send("cut")}>Cut</button>
      {!canCut && <p>Cut only after the minimum sample.</p>}
      {error && <p role="alert">{error}</p>}
      {steps.length > 0 && (
        <ol aria-label="Manual steps">
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}
    </div>
  );
}

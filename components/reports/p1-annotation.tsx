"use client";

import { useState } from "react";

export function AnnotationForm({ seriesId }: { seriesId: string }) {
  const [date, setDate] = useState("2026-10-09");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    setMessage("");
    const response = await fetch("/api/marketing/reports/p1/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesId, date, body }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not save the note");
      return;
    }
    setBody("");
    setMessage(`Logged for ${data.authorName} at ${data.loggedAt}. Reload the report to see it on the chart.`);
  };

  return (
    <form
      className="jr-dates"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label htmlFor="jr-note-date">Date</label>
      <input id="jr-note-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <label htmlFor="jr-note-body">Note</label>
      <input id="jr-note-body" value={body} onChange={(event) => setBody(event.target.value)} aria-label="Chart note" />
      <button type="submit" className="jr-btn">Add note</button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

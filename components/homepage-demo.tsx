"use client";

import { useState } from "react";
import type { DemoSegment } from "@/lib/homepage-content";

export function HomepageDemo({ segments, illustrative, group, barNote }: { segments: DemoSegment[]; illustrative: string; group: string; barNote: string }) {
  const [active, setActive] = useState(segments[0]?.id ?? "");
  const current = segments.find((segment) => segment.id === active) ?? segments[0];
  if (!current) return null;

  return (
    <div className="panel">
      <div className="ph mono">
        <span>{group}</span>
        <span>{illustrative}</span>
      </div>
      <div className="segs" role="group" aria-label="Example segments">
        {segments.map((segment) => {
          const pressed = segment.id === current.id;
          return (
            <button key={segment.id} type="button" className="seg" aria-pressed={pressed} onClick={() => setActive(segment.id)}>
              <b>{segment.name}</b>
              <span className="st">{segment.status}</span>
              <span className="bar" aria-hidden="true">
                <i style={{ width: `${segment.bar}%` }} />
              </span>
              <span className="m">{segment.channel}</span>
            </button>
          );
        })}
      </div>
      <div className="why2" aria-live="polite">
        <h3>{current.headline}</h3>
        <p>{current.body}</p>
        <p className="note">{current.note}</p>
      </div>
      <p className="mono lab">{barNote}</p>
    </div>
  );
}

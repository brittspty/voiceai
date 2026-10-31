"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Live updates. EventSource when the browser supports it, and a slow poll if the stream drops. */
export function AmFeedRefresh({ latestId = "" }: { latestId?: string }) {
  const router = useRouter();
  useEffect(() => {
    let source: EventSource | null = null;
    let seen = latestId;
    try {
      source = new EventSource("/api/marketing/feed?stream=1");
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { id?: string };
          if (!data.id || data.id === seen) return;
          seen = data.id;
          router.refresh();
        } catch {
          /* Ignore a malformed frame. The poll still runs. */
        }
      };
    } catch {
      source = null;
    }
    const poll = window.setInterval(() => router.refresh(), 30_000);
    return () => {
      source?.close();
      window.clearInterval(poll);
    };
  }, [latestId, router]);
  return null;
}

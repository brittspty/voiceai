"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decideAudienceUpload } from "@/lib/marketing/audiences/actions";
import { audienceUndoToast } from "@/lib/marketing/audiences/push";

export function AudienceUndo({ undoUntil, pushId }: { undoUntil: string; pushId: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => Math.ceil((Date.parse(undoUntil) - Date.now()) / 1000));
  useEffect(() => {
    const timer = setInterval(() => {
      const next = Math.ceil((Date.parse(undoUntil) - Date.now()) / 1000);
      setLeft(next);
      if (next <= 0) router.refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [undoUntil, router]);
  if (left <= 0) return null;
  return (
    <div role="status" aria-live="polite" className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-success-soft px-3 py-2 text-sm">
      <span>{audienceUndoToast(left)}</span>
      <form action={decideAudienceUpload}>
        <input type="hidden" name="pushId" value={pushId} />
        <input type="hidden" name="decision" value="undo" />
        <button type="submit" className="min-h-11 underline">Undo</button>
      </form>
    </div>
  );
}

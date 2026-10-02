"use client";

import { useState } from "react";
import Link from "next/link";
import { saveKnowledge } from "@/lib/actions";
import { timeAgo } from "@/lib/format";

export function KnowledgeEditor({
  canWrite,
  doc,
}: {
  canWrite: boolean;
  doc?: { id: string; title: string; body: string; status: string; updatedAt: string };
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!doc && !editing) {
    if (!canWrite) return null;
    return <button className="mb-4 rounded-full bg-ink px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black" onClick={() => setEditing(true)}>+ Add new</button>;
  }
  if (doc && !editing) {
    return (
      <article className="mx-auto max-w-3xl">
        <Link href="/knowledge" className="text-sm text-muted">← All documents</Link>
        <h2 className="mt-3 text-2xl font-semibold">{doc.title}</h2>
        <p className="mt-1 text-sm text-muted">{doc.status === "live" ? "Live" : "Draft"} · {timeAgo(doc.updatedAt)}</p>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7">{doc.body}</div>
        {canWrite && <button className="mt-6 rounded-full border border-line px-3 py-1.5 text-sm" onClick={() => setEditing(true)}>Edit</button>}
      </article>
    );
  }
  return (
    <form
      className="mx-auto max-w-3xl space-y-3"
      action={async (formData) => {
        try {
          const id = await saveKnowledge({
            id: doc?.id,
            title: String(formData.get("title") || ""),
            body: String(formData.get("body") || ""),
            publish: formData.get("publish") === "yes",
          });
          window.location.href = `/knowledge?doc=${id.id}`;
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not save");
        }
      }}
    >
      {doc && <Link href="/knowledge" className="text-sm text-muted">← All documents</Link>}
      <input name="title" defaultValue={doc?.title || ""} placeholder="Document title" className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" />
      <textarea name="body" defaultValue={doc?.body || ""} rows={18} className="w-full rounded-xl border border-line bg-card p-3 text-sm leading-6" placeholder="What the agent is allowed to say." />
      {error && <p className="text-sm text-[#d14343]">{error}</p>}
      <div className="flex gap-2">
        <button className="rounded-full border border-line px-3 py-1.5 text-sm" name="publish" value="no">Save draft</button>
        <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black" name="publish" value="yes">Make live</button>
      </div>
    </form>
  );
}

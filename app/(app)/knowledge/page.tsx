import Link from "next/link";
import { KnowledgeEditor } from "@/components/knowledge-editor";
import { PageTitle } from "@/components/shell";
import { timeAgo } from "@/lib/format";
import { listKnowledge } from "@/lib/queries";
import { requireUser } from "@/lib/auth";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { doc } = await searchParams;
  const [{ docs, selected }, user] = await Promise.all([listKnowledge(doc), requireUser()]);
  return (
    <div>
      <PageTitle title="Knowledge" subtitle="What the voice agent can answer from. Add a document, keep it as a draft until it reads right, then make it live." />
      {!selected && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <input placeholder="Search documents" className="h-9 w-64 rounded-lg border border-line bg-card px-3 text-sm" />
          </div>
          <KnowledgeEditor canWrite={user.role !== "viewer"} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((item) => (
              <Link key={item.id} href={`/knowledge?doc=${item.id}`} className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <span className={item.status === "live" ? "text-[#187a42]" : ""}>{item.status === "live" ? "Live" : "Draft"}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22a06b]" />
                  {timeAgo(item.updatedAt)}
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-dashed border-line px-6 py-16 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-chip text-muted">☰</div>
            <div className="mt-3 font-medium">Nothing open yet</div>
            <p className="mt-1 text-sm text-muted">Pick a document from the row above to read it, or add the first one.</p>
          </div>
        </>
      )}
      {selected && (
        <KnowledgeEditor
          canWrite={user.role !== "viewer"}
          doc={{ id: selected.id, title: selected.title, body: selected.body, status: selected.status, updatedAt: selected.updatedAt.toISOString() }}
        />
      )}
    </div>
  );
}

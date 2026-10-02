"use client";

import Link from "next/link";
import { useState } from "react";
import { CallDrawer, type CallRow } from "@/components/call-drawer";
import { ContactLines, Duration, OutcomePill } from "@/components/pills";
import { formatDateTime } from "@/lib/format";

export function RecentCalls({ rows }: { rows: CallRow[] }) {
  const [open, setOpen] = useState<CallRow | null>(null);
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Recent calls</h2>
        <Link href="/calls" className="text-sm text-muted hover:text-ink">All calls</Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[var(--shadow)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] tracking-wide text-muted">
              {["Time", "Contact", "Office", "Outcome", "Duration"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((call) => (
              <tr key={call.id} onClick={() => setOpen(call)} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover/60">
                <td className="px-4 py-3 text-muted">{formatDateTime(call.time)}</td>
                <td className="px-4 py-3"><ContactLines name={call.contactName} phone={call.phone} direction={call.direction} /></td>
                <td className="px-4 py-3">{call.office || "—"}</td>
                <td className="px-4 py-3"><OutcomePill outcome={call.outcome} /></td>
                <td className="px-4 py-3"><Duration seconds={call.durationSec} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CallDrawer call={open} onClose={() => setOpen(null)} />
    </section>
  );
}

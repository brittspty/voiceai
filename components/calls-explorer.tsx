"use client";

import Link from "next/link";
import { useState } from "react";
import { Suspense } from "react";
import { CallDrawer, type CallRow } from "@/components/call-drawer";
import { Explorer } from "@/components/explorer";
import { ConsentPill, ContactLines, Duration, Money, OutcomePill, StatusPill } from "@/components/pills";
import { formatDateTime } from "@/lib/format";

const outcomes = ["callback_requested", "booked", "failed", "no_answer", "voicemail", "not_interested", "wrong_number"].map((value) => ({
  value,
  label: value.replaceAll("_", " "),
}));
const statuses = ["queued", "dialing", "in_progress", "wrap_up", "completed", "failed"].map((value) => ({ value, label: value.replaceAll("_", " ") }));

export function CallsExplorer({ rows, total, page, perPage, offices, mode = "all" }: { rows: CallRow[]; total: number; page: number; perPage: number; offices: { id: string; name: string }[]; mode?: "all" | "voice" }) {
  const [open, setOpen] = useState<CallRow | null>(null);
  const officeOptions = offices.map((o) => ({ value: o.id, label: o.name }));
  return (
    <Suspense>
      <Explorer
        rows={rows}
        storageKey={mode === "voice" ? "voice" : "calls"}
        searchPlaceholder="Search name or number"
        total={total}
        page={page}
        perPage={perPage}
        date
        menus={mode === "voice" ? [] : [
          { param: "office", label: "Office", options: officeOptions },
          { param: "outcome", label: "Outcome", options: outcomes },
          { param: "status", label: "Status", options: statuses },
          { param: "consent", label: "Consent", options: [{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }, { value: "none", label: "None" }] },
        ]}
        segments={[{ param: "tests", label: "Test calls", options: [{ value: "any", label: "Any" }, { value: "hidden", label: "Hidden" }, { value: "shown", label: "Shown" }] }]}
        emptyTitle="No calls yet"
        emptyBody={mode === "voice" ? "Calls Avery places will show up here, including test calls." : "In test mode, only test calls show up here."}
        emptyAction={<Link href="/settings/test-console" className="btn-brand inline-flex h-9 items-center rounded-full px-3 text-sm">Place a test call</Link>}
        onRow={setOpen}
        columns={mode === "voice" ? [
          { id: "time", header: "TIME", cell: (row) => <span className="text-muted">{formatDateTime(row.time)}</span> },
          { id: "contact", header: "CONTACT", cell: (row) => <ContactLines name={row.contactName} phone={row.phone} direction={row.direction} /> },
          { id: "outcome", header: "OUTCOME", cell: (row) => <OutcomePill outcome={row.outcome} /> },
          { id: "ghl", header: "GOHIGHLEVEL", cell: (row) => row.ghlSync.label },
        ] : [
          { id: "time", header: "TIME", cell: (row) => <span className="whitespace-nowrap text-muted">{formatDateTime(row.time)}</span> },
          { id: "contact", header: "CONTACT", cell: (row) => <ContactLines name={row.contactName} phone={row.phone} direction={row.direction} /> },
          { id: "office", header: "OFFICE", cell: (row) => row.office || "—" },
          { id: "status", header: "STATUS", cell: (row) => <StatusPill status={row.status} /> },
          { id: "outcome", header: "OUTCOME", cell: (row) => <OutcomePill outcome={row.outcome} /> },
          { id: "consent", header: "CONSENT", cell: (row) => <ConsentPill consent={row.consent} /> },
          { id: "duration", header: "DURATION", cell: (row) => <Duration seconds={row.durationSec} /> },
          { id: "cost", header: "COST", cell: (row) => <Money cents={row.costCents} />, defaultHidden: true },
          { id: "ghl", header: "GOHIGHLEVEL", cell: (row) => row.ghlSync.label },
        ]}
        stackOnMobile
        trailing={mode === "voice" ? (row) => (
          <div className="flex justify-end gap-3 text-sm text-muted">
            <button type="button" onClick={() => setOpen(row)} className="inline-flex min-h-6 items-center hover:text-ink max-sm:min-h-11">Details</button>
            {row.recordingUrl && <button type="button" onClick={() => setOpen(row)} className="inline-flex min-h-6 items-center hover:text-ink max-sm:min-h-11">Recording</button>}
          </div>
        ) : undefined}
      />
      <CallDrawer call={open} onClose={() => setOpen(null)} />
    </Suspense>
  );
}

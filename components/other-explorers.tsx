"use client";

import Link from "next/link";
import { useState } from "react";
import { Explorer } from "@/components/explorer";
import { ConsentPill } from "@/components/pills";
import { addDnc, importDnc, setDncActive } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/phone";

export function AppointmentsExplorer({
  rows, total, page, perPage, offices,
}: {
  rows: { id: string; contact: string; phone: string; advisor: string; office: string; when: string; format: string; status: string }[];
  total: number; page: number; perPage: number; offices: { id: string; name: string }[];
}) {
  return (
    <Explorer
      rows={rows}
      storageKey="appointments"
      searchPlaceholder="Search contact"
      total={total}
      page={page}
      perPage={perPage}
      date
      menus={[
        { param: "office", label: "Office", options: offices.map((o) => ({ value: o.id, label: o.name })) },
        { param: "status", label: "Status", options: ["pending", "confirmed", "cancelled", "completed"].map((v) => ({ value: v, label: v })) },
        { param: "format", label: "Format", options: ["phone", "video", "in_person"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
      ]}
      segments={[{ param: "timing", label: "Timing", options: [{ value: "any", label: "Any" }, { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }] }]}
      emptyTitle="No meetings booked yet"
      emptyBody="When Avery books a meeting, it lands here and on your calendar."
      emptyAction={<Link href="/calls/calendar" className="inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm text-white dark:bg-white dark:text-black">Check calendar connection</Link>}
      columns={[
        { id: "contact", header: "CONTACT", cell: (row) => <div><div className="font-medium">{row.contact}</div><div className="text-xs text-muted">{maskPhone(row.phone)}</div></div> },
        { id: "advisor", header: "ADVISOR", cell: (row) => row.advisor },
        { id: "office", header: "OFFICE", cell: (row) => row.office },
        { id: "when", header: "WHEN", cell: (row) => formatDateTime(row.when) },
        { id: "format", header: "FORMAT", cell: (row) => row.format.replace("_", " ") },
        { id: "status", header: "STATUS", cell: (row) => <span className="capitalize">{row.status}</span> },
      ]}
    />
  );
}

export function ContactsExplorer({
  rows, total, page, perPage, offices,
}: {
  rows: { id: string; name: string; phone: string; email: string | null; office: string | null; consent: string; dnc: boolean; added: string }[];
  total: number; page: number; perPage: number; offices: { id: string; name: string }[];
}) {
  return (
    <Explorer
      rows={rows}
      storageKey="contacts"
      searchPlaceholder="Search name, phone, or email"
      total={total}
      page={page}
      perPage={perPage}
      menus={[
        { param: "office", label: "Office", options: offices.map((o) => ({ value: o.id, label: o.name })) },
        { param: "consent", label: "Consent", options: ["high", "medium", "low", "none"].map((v) => ({ value: v, label: v })) },
      ]}
      segments={[{ param: "dnc", label: "Do not call", options: [{ value: "any", label: "Any" }, { value: "on", label: "On the list" }, { value: "off", label: "Not on the list" }] }]}
      emptyTitle="No leads yet"
      emptyBody="New GoHighLevel leads appear here automatically."
      emptyAction={<Link href="/settings/integrations" className="inline-flex h-9 items-center rounded-full bg-ink px-3 text-sm text-white dark:bg-white dark:text-black">Connect GoHighLevel</Link>}
      columns={[
        { id: "name", header: "NAME", cell: (row) => <span className="font-medium">{row.name}</span> },
        { id: "phone", header: "PHONE", cell: (row) => maskPhone(row.phone) },
        { id: "email", header: "EMAIL", cell: (row) => row.email || "—" },
        { id: "office", header: "OFFICE", cell: (row) => row.office || "—" },
        { id: "consent", header: "CONSENT", cell: (row) => <ConsentPill consent={row.consent} /> },
        { id: "dnc", header: "DO NOT CALL", cell: (row) => row.dnc ? "On list" : "—" },
        { id: "added", header: "ADDED", cell: (row) => <span className="whitespace-nowrap text-muted">{formatDateTime(row.added)}</span> },
      ]}
    />
  );
}

export function DncExplorer({
  rows, total, page, perPage,
}: {
  rows: { id: string; phone: string; reason: string; source: string; addedBy: string; added: string; expires: string | null; active: boolean }[];
  total: number; page: number; perPage: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  return (
    <div>
      {error && <p className="mb-3 text-sm text-[#9f1239]" role="alert">{error}</p>}
      {summary && <p className="mb-3 text-sm text-emerald-800" role="status">{summary}</p>}
      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-2">
        <form action={async (formData) => { try { const result = await importDnc(String(formData.get("csv") || "")); setError(null); setSummary(`${result.count} added, ${result.skipped} skipped (invalid).`); } catch (e) { setSummary(null); setError(e instanceof Error ? e.message : "Import failed"); } }} className="space-y-2">
          <label className="block text-sm">Upload CSV
            <textarea name="csv" rows={3} placeholder={"2515550123, asked not to be called"} className="mt-1 w-full rounded-lg border border-line bg-card px-2 py-1 text-sm" />
          </label>
          <p className="text-xs text-muted">One number per line. You can add a reason after a comma.</p>
          <button className="h-9 rounded-full border border-line bg-card px-3 text-sm">Upload CSV</button>
        </form>
        <form action={async (formData) => { try { await addDnc({ phone: String(formData.get("phone") || ""), reason: String(formData.get("reason") || "") }); setError(null); setSummary("Number added. Avery will not call it."); } catch (e) { setSummary(null); setError(e instanceof Error ? e.message : "Could not add"); } }} className="space-y-2">
          <label className="block text-sm">Phone number
            <input name="phone" placeholder="(251) 555-0123" className="mt-1 h-9 w-full rounded-lg border border-line bg-card px-2 text-sm" />
          </label>
          <label className="block text-sm">Reason
            <input name="reason" placeholder="Asked not to be called" className="mt-1 h-9 w-full rounded-lg border border-line bg-card px-2 text-sm" />
          </label>
          <p className="text-xs text-muted">Use a 10-digit number, like (251) 555-0123.</p>
          <button className="h-9 rounded-full bg-ink px-3 text-sm text-white dark:bg-white dark:text-black">Add a number</button>
        </form>
      </div>
      <Explorer
        rows={rows}
        storageKey="dnc"
        searchPlaceholder="Search phone digits"
        total={total}
        page={page}
        perPage={perPage}
        date
        menus={[{ param: "reason", label: "Reason", options: [] }]}
        segments={[{ param: "status", label: "Status", options: [{ value: "any", label: "Any" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]}
        emptyTitle="Your do-not-call list is empty"
        emptyBody="Add numbers Avery must never call. We also check the national list."
        columns={[
          { id: "phone", header: "PHONE", cell: (row) => maskPhone(row.phone) },
          { id: "reason", header: "REASON", cell: (row) => row.reason },
          { id: "source", header: "SOURCE", cell: (row) => row.source },
          { id: "by", header: "ADDED BY", cell: (row) => row.addedBy },
          { id: "added", header: "ADDED", cell: (row) => formatDateTime(row.added) },
          { id: "expires", header: "EXPIRES", cell: (row) => row.expires ? formatDateTime(row.expires) : "—" },
          { id: "active", header: "ACTIVE", cell: (row) => (
            <form action={async () => { await setDncActive(row.id, !row.active); }}>
              <button className="text-sm underline">{row.active ? "Yes" : "No"}</button>
            </form>
          ) },
        ]}
      />
    </div>
  );
}

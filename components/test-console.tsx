"use client";

import { useEffect, useState } from "react";
import { preflightCall, startTestCall } from "@/lib/actions";
import type { GateCheckView } from "@/lib/types";
import type { CallRow } from "@/components/call-drawer";

export function TestConsole({ offices, contacts }: { offices: { id: string; name: string }[]; contacts: { id: string; name: string; phone: string }[] }) {
  const [checks, setChecks] = useState<GateCheckView[] | null>(null);
  const [call, setCall] = useState<CallRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(form: HTMLFormElement | null, intent: "preflight" | "call") {
    if (!form) return;
    const data = new FormData(form);
    setError(null);
    setPending(true);
    try {
      const contactId = String(data.get("contactId") || "");
      const payload = {
        contactId: contactId || undefined,
        name: String(data.get("name") || ""),
        phone: String(data.get("phone") || ""),
        consent: String(data.get("consent") || "high") as "high",
        officeId: String(data.get("officeId") || ""),
        simulatedOutcome: String(data.get("outcome") || "callback_requested") as "callback_requested",
      };
      if (intent === "preflight") {
        setChecks(await preflightCall(payload).then((r) => r.checks));
      } else {
        const started = await startTestCall(payload);
        const res = await fetch(`/api/calls/${started.callId}`);
        setCall(await res.json());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!call || call.status === "completed" || call.status === "failed") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/calls/${call.id}`);
      if (res.ok) setCall(await res.json());
    }, 1200);
    return () => clearInterval(timer);
  }, [call]);

  return (
    <form
      className="grid gap-4 lg:grid-cols-2"
      method="post"
      action="/settings/test-console"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="space-y-3 rounded-xl border border-line bg-card p-4">
        <label className="block text-sm">Existing contact
          <select name="contactId" className="mt-1 h-9 w-full rounded-lg border border-line bg-transparent px-2">
            <option value="">New test number</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Name<input name="name" defaultValue="Demo lead" className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Phone<input name="phone" defaultValue="+19195550100" className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Consent
            <select name="consent" defaultValue="high" className="mt-1 h-9 w-full rounded-lg border border-line bg-transparent px-2">
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="none">None</option>
            </select>
          </label>
          <label className="text-sm">Office
            <select name="officeId" className="mt-1 h-9 w-full rounded-lg border border-line bg-transparent px-2">
              {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">Simulated outcome
          <select name="outcome" className="mt-1 h-9 w-full rounded-lg border border-line bg-transparent px-2">
            <option value="callback_requested">Callback requested</option>
            <option value="booked">Booked</option>
            <option value="no_answer">No answer</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        {error && <p className="text-sm text-[#d14343]">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="rounded-full border border-line px-3 py-1.5 text-sm" disabled={pending} onClick={(event) => run(event.currentTarget.form, "preflight")}>Run preflight</button>
          <button type="button" className="rounded-full bg-ink px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black" disabled={pending || Boolean(checks && checks.some((c) => !c.passed))} onClick={(event) => run(event.currentTarget.form, "call")}>Place test call</button>
        </div>
        <p className="text-xs text-muted">Test calls use the same gates and count against the daily cap. In test mode the voice provider and CRM are mocked.</p>
      </div>
      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="font-medium">Preflight</h3>
        {!checks && <p className="mt-2 text-sm text-muted">Run the checks before you dial.</p>}
        <ul className="mt-3 space-y-2 text-sm">
          {checks?.map((check) => (
            <li key={check.id}><span className={check.passed ? "text-[#187a42]" : "text-[#d14343]"}>{check.passed ? "Pass" : "Block"}</span> · {check.detail}</li>
          ))}
        </ul>
        {call && (
          <div className="mt-4 border-t border-line pt-3 text-sm">
            <div className="font-medium">Call {call.status.replaceAll("_", " ")}</div>
            {call.outcome && <div className="text-muted">Outcome: {call.outcome.replaceAll("_", " ")}</div>}
            {call.transcript?.[0] && <p className="mt-2 text-muted">{call.transcript[0].text}</p>}
            <a className="mt-2 inline-block underline" href="/calls">Open Calls</a>
          </div>
        )}
      </div>
    </form>
  );
}

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ConsentPill, Duration, Money, OutcomePill, StatusPill } from "@/components/pills";
import { formatDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/phone";
import type { GateCheckView, TimelineEvent, TranscriptLine } from "@/lib/types";

export type CallRow = {
  id: string;
  time: string;
  contactName: string;
  phone: string;
  direction: string;
  office: string | null;
  status: string;
  outcome: string | null;
  consent: string;
  durationSec: number;
  costCents: number;
  isTest: boolean;
  transcript: TranscriptLine[];
  timeline: TimelineEvent[];
  gateChecks: GateCheckView[];
  recordingUrl: string | null;
  elevenLabsId: string | null;
  failureReason: string | null;
  consentScope?: string | null;
};

export function CallDrawer({ call, onClose }: { call: CallRow | null; onClose: () => void }) {
  return (
    <Dialog.Root open={Boolean(call)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-card p-5 shadow-xl">
          {call && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Dialog.Title className="text-lg font-semibold">{call.contactName}</Dialog.Title>
                  <Dialog.Description className="text-sm text-muted">{maskPhone(call.phone)} · {call.office || "—"}</Dialog.Description>
                </div>
                <Dialog.Close className="rounded-md px-2 py-1 text-sm text-muted hover:bg-hover">Close</Dialog.Close>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill status={call.status} />
                <OutcomePill outcome={call.outcome} />
                {call.isTest && <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">Test</span>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Meta label="When" value={formatDateTime(call.time)} />
                <Meta label="Direction" value={call.direction === "inbound" ? "Called in" : "Outbound"} />
                <Meta label="Duration" value={<Duration seconds={call.durationSec} />} />
                <Meta label="Cost" value={<Money cents={call.costCents} />} />
                <Meta label="Consent" value={<ConsentPill consent={call.consent} />} />
                <Meta label="Scope" value={call.consentScope === "scheduling_only" ? "Scheduling only" : call.consentScope === "full" ? "Full conversation" : "—"} />
                <Meta label="ElevenLabs" value={call.elevenLabsId || "—"} />
              </dl>
              {call.failureReason && <p className="mt-3 rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-[#d14343]">{call.failureReason}</p>}
              <section className="mt-5">
                <h3 className="text-sm font-medium">Recording</h3>
                {call.recordingUrl ? <audio className="mt-2 w-full" controls src={call.recordingUrl} /> : <p className="mt-2 text-sm text-muted">No recording yet.</p>}
              </section>
              <section className="mt-5">
                <h3 className="text-sm font-medium">Pre-dial checks</h3>
                <ul className="mt-2 space-y-1.5">
                  {call.gateChecks.length === 0 && <li className="text-sm text-muted">No gate record on this call.</li>}
                  {call.gateChecks.map((check) => (
                    <li key={check.id} className="text-sm">
                      <span className={check.passed ? "text-[#187a42]" : "text-[#d14343]"}>{check.passed ? "Passed" : "Blocked"}</span>
                      <span className="text-muted"> · {check.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="mt-5">
                <h3 className="text-sm font-medium">Transcript</h3>
                <div className="mt-2 space-y-2">
                  {call.transcript.map((line, index) => (
                    <div key={index} className={line.speaker === "agent" ? "mr-8 rounded-2xl bg-chip px-3 py-2 text-sm" : "ml-8 rounded-2xl bg-[#e8f1ff] px-3 py-2 text-sm"}>
                      <div className="text-[11px] uppercase tracking-wide text-muted">{line.speaker === "agent" ? "Agent" : "Contact"} · {line.atSec}s</div>
                      {line.text}
                    </div>
                  ))}
                  {call.transcript.length === 0 && <p className="text-sm text-muted">The transcript arrives when the call wraps up.</p>}
                </div>
              </section>
              <section className="mt-5">
                <h3 className="text-sm font-medium">Timeline</h3>
                <ol className="mt-2 space-y-3 border-l border-line pl-3">
                  {call.timeline.map((event, index) => (
                    <li key={index}>
                      <div className="text-sm">{event.label}</div>
                      <div className="text-xs text-muted">{formatDateTime(event.at)}{event.detail ? ` · ${event.detail}` : ""}</div>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-all">{value}</dd>
    </div>
  );
}

import { decideConversionTurnOn, requestConversionTurnOn, saveConversionClient, saveConversionStage } from "@/lib/marketing/offline/actions";
import { META_EVENT_NAMES } from "@/lib/marketing/offline/types";
import type { ConversionFeedbackView } from "@/lib/marketing/offline/view";
import { ConnectLink, ErrorDrawer, UndoToast } from "./conversion-widgets";

const GOOGLE_EVENTS = ["Qualified lead", "Booked call", "Sold"];

function Chip({ label }: { label: string }) {
  const icon = label.startsWith("Connected") ? "✓" : label === "Needs attention" ? "!" : label === "Dry run" ? "○" : "–";
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-chip px-3 text-sm font-medium text-ink">
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

export function ConversionFeedback({
  view,
  canEdit,
  reconnectMeta,
  reconnectGoogle,
}: {
  view: ConversionFeedbackView;
  canEdit: boolean;
  reconnectMeta: boolean;
  reconnectGoogle: boolean;
}) {
  return (
    <div className="space-y-4">
      {view.exampleData && <p className="rounded-lg border border-line bg-chip px-3 py-2 text-xs font-semibold">EXAMPLE DATA</p>}
      <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm" role="status" aria-live="polite">{view.banner}</p>
      {view.empty && (
        <section className="rounded-xl border border-line bg-card p-4">
          <p>{view.emptyCopy}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {reconnectMeta && <ConnectLink href="/api/marketing/conversions/connect/meta" label="Connect Meta" />}
            {reconnectGoogle ? <ConnectLink href="/api/marketing/conversions/connect/google" label="Connect Google" /> : <p className="text-sm">A super admin reconnects Google.</p>}
          </div>
        </section>
      )}
      {view.successCopy && <p className="rounded-xl border border-success-border bg-success-soft px-4 py-3 text-sm" role="status">{view.successCopy}</p>}
      {view.errorBanner && (
        <section className="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm" role="alert">
          <p>{view.errorBanner}</p>
          <div className="mt-3">
            {view.errorBanner.startsWith("Google") ? (
              reconnectGoogle ? <ConnectLink href="/api/marketing/conversions/connect/google" label="Reconnect" /> : <p>A super admin reconnects Google.</p>
            ) : (
              reconnectMeta && <ConnectLink href="/api/marketing/conversions/connect/meta" label="Reconnect" />
            )}
          </div>
        </section>
      )}
      <div className="grid gap-3">
        {view.platforms.map((row) => (
          <article key={row.platform} className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{row.label}</h2>
              <Chip label={row.statusLabel} />
            </div>
            <p className="mt-2 text-sm text-muted">{row.lastSentLabel}</p>
            <p className="mt-3 text-base font-medium">{row.matchRateLabel}</p>
            <p className="text-sm text-muted">{row.matchHint}</p>
            {row.valueLabel && <p className="mt-2 text-sm">{row.valueLabel}</p>}
            <h3 className="mt-4 text-sm font-medium">{row.eventsLabel}</h3>
            {row.events.length === 0 ? <p className="text-sm text-muted">None yet</p> : (
              <ul className="mt-1 text-sm">
                {row.events.map((event) => <li key={event.label}>{event.label} {event.count}</li>)}
              </ul>
            )}
            <div className="mt-3">
              <ErrorDrawer count={row.errorCount} errors={row.errors} technical={row.technicalDetails} />
            </div>
          </article>
        ))}
      </div>
      <section className="space-y-4">
        <h2 className="font-semibold">Stage map</h2>
        {view.clients.length === 0 && <p className="text-sm text-muted">No clients yet. Add the GoHighLevel location, then map booked and sold.</p>}
        {canEdit && (
          <form action={saveConversionClient} className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-2">
            <label className="block text-sm">Client name
              <input name="name" required maxLength={120} className="mt-1 block h-11 w-full rounded-lg border border-line px-3" />
            </label>
            <label className="block text-sm">GoHighLevel location id
              <input name="ghlLocationId" maxLength={80} className="mt-1 block h-11 w-full rounded-lg border border-line px-3" />
            </label>
            <button className="btn-brand min-h-11 rounded-full px-4 text-sm md:col-span-2 md:w-fit" type="submit">Add client</button>
          </form>
        )}
        {view.clients.map((client) => (
          <section key={client.id} className="rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{client.name}</h3>
              <p className="text-sm">{client.statusLabel}</p>
            </div>
            <div className="mt-3 space-y-4">
              {client.stages.map((stage) => {
                const actionIsId = /^\d+$/.test(stage.googleAction) || /^customers\/\d+\/conversionActions\/\d+$/.test(stage.googleAction);
                const selectedAction = actionIsId ? (stage.kind === "qualified" ? "Qualified lead" : stage.kind === "booked" ? "Booked call" : "Sold") : stage.googleAction;
                return (
                  <form key={stage.id} action={saveConversionStage} className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                    <input type="hidden" name="stageId" value={stage.id} />
                    <label className="block text-sm">Our stage
                      <input name="ghlStageName" defaultValue={stage.name} required className="mt-1 block h-11 w-full rounded-lg border border-line px-3" readOnly={!canEdit} />
                    </label>
                    <label className="block text-sm">GoHighLevel stage id
                      <input name="ghlStageId" defaultValue={stage.stageId} className="mt-1 block h-11 w-full rounded-lg border border-line px-3" readOnly={!canEdit} />
                    </label>
                    <label className="block text-sm" htmlFor={`meta-${stage.id}`}>Meta event for {stage.name}
                      <select id={`meta-${stage.id}`} name="metaEventName" defaultValue={stage.metaEventName} disabled={!canEdit} className="mt-1 block h-11 w-full rounded-lg border border-line px-3">
                        {META_EVENT_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm" htmlFor={`google-${stage.id}`}>Google event for {stage.name}
                      <select id={`google-${stage.id}`} name="googleAction" defaultValue={GOOGLE_EVENTS.includes(selectedAction) ? selectedAction : GOOGLE_EVENTS[0]} disabled={!canEdit} className="mt-1 block h-11 w-full rounded-lg border border-line px-3">
                        {GOOGLE_EVENTS.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm">Google conversion action id
                      <input name="googleActionId" defaultValue={actionIsId ? stage.googleAction : ""} readOnly={!canEdit} className="mt-1 block h-11 w-full rounded-lg border border-line px-3" />
                    </label>
                    {view.seesValue && (
                      <label className="block text-sm">Dollar value for {stage.name}
                        <input name="valueDollars" inputMode="decimal" defaultValue={stage.valueCents != null ? (stage.valueCents / 100).toFixed(2) : ""} readOnly={!canEdit} className="mt-1 block h-11 w-full rounded-lg border border-line px-3" />
                      </label>
                    )}
                    {canEdit && <button className="btn-brand min-h-11 rounded-full px-4 text-sm md:col-span-2 md:w-fit" type="submit">Save {stage.name}</button>}
                  </form>
                );
              })}
            </div>
            {client.decision && (
              <article className="mt-4 rounded-xl border border-line bg-canvas p-4" aria-labelledby={`turn-on-${client.id}`}>
                <div className="flex flex-wrap gap-2 text-sm text-muted">
                  <span className="rounded-md border border-line bg-chip px-2 py-0.5 text-xs font-bold text-ink">{client.decision.tag}</span>
                  <span>{client.decision.clientLabel}</span>
                  <span>{client.decision.expiry}</span>
                  <span>{client.decision.tier}</span>
                </div>
                <h3 id={`turn-on-${client.id}`} className="mt-2 text-lg font-semibold">{client.decision.headline}</h3>
                <p className="mt-1">{client.decision.fix}</p>
                <p className="mt-2 text-sm">{client.decision.impact}</p>
                <p className="mt-2 text-sm">Confidence <b>{client.decision.confidence}</b></p>
                <details className="mt-3 text-sm">
                  <summary>Show evidence</summary>
                  <p className="mt-2 text-muted">{client.decision.evidence}</p>
                </details>
                {canEdit && client.decision.canApprove && (
                  <div className="mt-3 flex flex-wrap gap-2 max-sm:sticky max-sm:bottom-0 max-sm:bg-canvas max-sm:py-2">
                    <form action={decideConversionTurnOn}>
                      <input type="hidden" name="decisionId" value={client.decision.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="btn-brand min-h-11 rounded-full px-4 text-sm" type="submit">Approve</button>
                    </form>
                    <form action={decideConversionTurnOn}>
                      <input type="hidden" name="decisionId" value={client.decision.id} />
                      <input type="hidden" name="decision" value="decline" />
                      <button className="min-h-11 rounded-full border border-line bg-card px-4 text-sm" type="submit">Decline</button>
                    </form>
                    <form action={decideConversionTurnOn}>
                      <input type="hidden" name="decisionId" value={client.decision.id} />
                      <input type="hidden" name="decision" value="later" />
                      <button className="min-h-11 rounded-full border border-line bg-card px-4 text-sm" type="submit">Later</button>
                    </form>
                  </div>
                )}
                {client.decision.canUndo && client.decision.undoSeconds != null && (
                  <UndoToast undoUntil={client.decision.undoUntil ?? ""} clientId={client.id} decisionId={client.decision.id} />
                )}
              </article>
            )}
            {canEdit && view.featureOn && !client.enabled && !client.decision && (
              <form action={requestConversionTurnOn} className="mt-4">
                <input type="hidden" name="clientId" value={client.id} />
                <button className="btn-brand min-h-11 rounded-full px-4 text-sm" type="submit">Turn on</button>
              </form>
            )}
          </section>
        ))}
      </section>
    </div>
  );
}

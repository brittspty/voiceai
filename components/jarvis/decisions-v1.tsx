import Link from "next/link";
import { DASH_DAY_OPTIONS, type DashWindow } from "@/lib/marketing/dashboard-model";
import { realViewSearch, type RealStatus } from "@/lib/marketing/real-view";
import { recordDecisionAction } from "@/lib/marketing/decisions/actions";
import type { DecisionListModel } from "@/lib/marketing/decisions/query";
import { viewerLine, visibleDecisionActions, type DecisionCard } from "@/lib/marketing/decisions/present";

function decisionHref(input: { days: DashWindow; status: RealStatus; clientId: string | null; bucket: "open" | "closed"; path: string }) {
  const base = realViewSearch({
    days: input.days,
    status: input.status,
    staff: true,
    clientId: input.clientId,
    path: input.path,
  });
  if (input.bucket !== "closed") return base;
  return `${base}${base.includes("?") ? "&" : "?"}closed=1`;
}

function queryOf(days: DashWindow, status: RealStatus, clientId: string | null, bucket: "open" | "closed") {
  return decisionHref({ days, status, clientId, bucket, path: "" }).replace(/^\?/, "");
}

function priorHref(card: DecisionCard) {
  const value = card.evidence.priorRecommendationId;
  return typeof value === "string" && value ? `/decisions/${value}` : "";
}

function Filters({
  days,
  status,
  clientId,
  bucket,
  closedCount,
}: {
  days: DashWindow;
  status: RealStatus;
  clientId: string | null;
  bucket: "open" | "closed";
  closedCount: number;
}) {
  const href = (patch: { days?: DashWindow; status?: RealStatus; bucket?: "open" | "closed" }) =>
    decisionHref({
      days: patch.days ?? days,
      status: patch.status !== undefined ? patch.status : status,
      clientId,
      bucket: patch.bucket ?? bucket,
      path: "/decisions",
    });
  return (
    <nav className="ctl" aria-label="Filters">
      <div role="group" aria-label="Date range">
        {DASH_DAY_OPTIONS.map((option) => (
          <Link key={option} href={href({ days: option })} className={days === option ? "btn p" : "btn"} aria-current={days === option ? "page" : undefined}>
            {option} days
          </Link>
        ))}
      </div>
      <div role="group" aria-label="Status">
        <Link href={href({ status: "active" })} className={status === "active" ? "btn p" : "btn"} aria-current={status === "active" ? "page" : undefined}>
          Active
        </Link>
        <Link href={href({ status: "paused" })} className={status === "paused" ? "btn p" : "btn"} aria-current={status === "paused" ? "page" : undefined}>
          Paused
        </Link>
        <Link href={href({ status: "" })} className={status === "" ? "btn p" : "btn"} aria-current={status === "" ? "page" : undefined}>
          All
        </Link>
      </div>
      <div role="group" aria-label="Decision state">
        <Link href={href({ bucket: "open" })} className={bucket === "open" ? "btn p" : "btn"} aria-current={bucket === "open" ? "page" : undefined}>
          Open
        </Link>
        <Link href={href({ bucket: "closed" })} className={bucket === "closed" ? "btn p" : "btn"} aria-current={bucket === "closed" ? "page" : undefined}>
          Closed ({closedCount})
        </Link>
      </div>
    </nav>
  );
}

export function DecisionsV1({ model }: { model: DecisionListModel }) {
  return (
    <main className="decisions-v1">
      <Filters days={model.days} status={model.status} clientId={model.clientId} bucket={model.bucket} closedCount={model.closedCount} />
      <div className="top">
        <div>
          <div className="sub">{model.clientName} · Last {model.days} days · Grouped by client</div>
          <h1>Decisions</h1>
          <p className="sub">{viewerLine(model.canAct, model.viewerEmail)}</p>
        </div>
      </div>
      {model.groups.length === 0 ? (
        <p>{model.bucket === "closed" ? "No closed decisions in this view." : "No open decisions in this view."}</p>
      ) : (
        model.groups.map((group) => (
          <section key={group.clientId} className="box" style={{ marginBottom: 16 }}>
            <h2>{group.clientName}</h2>
            <ul className="feed">
              {group.items.map((item) => (
                <li key={item.id} className="fi">
                  <span className={item.severity === "critical" ? "sev u" : item.severity === "high" ? "sev h" : "sev i"}>{item.severity}</span>
                  <div>
                    <Link href={`/decisions/${item.id}?${queryOf(model.days, model.status, model.clientId, model.bucket)}`}>
                      <b>{item.title}</b>
                    </Link>
                    <div className="sub">{item.summary}</div>
                    {priorHref(item) ? <div className="sub"><Link href={priorHref(item)}>Earlier decision</Link></div> : null}
                  </div>
                  <span className="sub">{item.recency.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function sources(card: DecisionCard) {
  const raw = card.evidence.sources;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; date?: unknown; impressions?: unknown; clicks?: unknown; conversions?: unknown };
    return [{
      id: typeof row.id === "string" ? row.id : "",
      date: typeof row.date === "string" ? row.date : "",
      impressions: typeof row.impressions === "number" ? row.impressions : null,
      clicks: typeof row.clicks === "number" ? row.clicks : null,
      conversions: typeof row.conversions === "number" ? row.conversions : null,
    }];
  });
}

export function DecisionDetail({
  card,
  canAct,
  viewerEmail,
  audits,
  back,
}: {
  card: DecisionCard;
  canAct: boolean;
  viewerEmail: string;
  audits: { id: string; action: string; reason: string; note: string; snoozeUntil: string; who: string; at: string }[];
  back: string;
}) {
  const rows = sources(card);
  const actions = visibleDecisionActions(card.status, canAct);
  const earlier = priorHref(card);
  return (
    <main className="decisions-v1">
      <p className="crumb"><Link href={back || "/decisions"}>Decisions</Link> <span className="sep">/</span> {card.clientName}</p>
      <div className="top">
        <div>
          <div className="tag">{card.severity} · {card.clientName}</div>
          <h1>{card.title}</h1>
          <p className="sub">{card.summary}</p>
          <p className="sub">{viewerLine(canAct, viewerEmail)}</p>
          {earlier ? <p className="sub"><Link href={earlier}>Earlier decision</Link></p> : null}
        </div>
      </div>
      <dl className="ev">
        <div className="m"><div className="lab">Metric</div><div>{card.metric}</div></div>
        <div className="m"><div className="lab">Baseline</div><div>{card.baseline}</div></div>
        <div className="m"><div className="lab">Observed</div><div>{card.observed}</div></div>
        <div className="m"><div className="lab">Window</div><div>{card.windowStart && card.windowEnd ? `${card.windowStart} to ${card.windowEnd}` : "Not set"}</div></div>
        <div className="m"><div className="lab">Sample size</div><div>{card.sampleSize}</div></div>
        <div className="m"><div className="lab">Source metrics</div><div>{card.sourceMetricIds.length}</div></div>
      </dl>
      <p>{card.rationale}</p>
      {rows.length > 0 && (
        <table className="stack">
          <caption>Source metrics</caption>
          <thead>
            <tr><th>Id</th><th>Date</th><th>Impressions</th><th>Clicks</th><th>Conversions</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || row.date}>
                <td data-label="Id">{row.id}</td>
                <td data-label="Date">{row.date}</td>
                <td data-label="Impressions">{row.impressions ?? ""}</td>
                <td data-label="Clicks">{row.clicks ?? ""}</td>
                <td data-label="Conversions">{row.conversions ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {card.sourceMetricIds.length > 0 && rows.length === 0 && (
        <ul>
          {card.sourceMetricIds.map((id) => <li key={id}>{id}</li>)}
        </ul>
      )}
      {card.status === "accepted" && (
        <div className="pend">
          <b>Recorded. Nothing was changed.</b>
          <ol>{card.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
      )}
      {actions.length > 0 && (
        <div className="acts">
          {actions.includes("Approve") && (
            <form action={recordDecisionAction}>
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="action" value="approve" />
              <label className="field">Note
                <input name="note" />
              </label>
              <button className="btn p" type="submit">Approve</button>
            </form>
          )}
          {actions.includes("Dismiss") && (
            <form action={recordDecisionAction}>
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="action" value="dismiss" />
              <label className="field">Reason
                <input name="reason" required />
              </label>
              <label className="field">Note
                <input name="note" />
              </label>
              <button className="btn" type="submit">Dismiss</button>
            </form>
          )}
          {actions.includes("Snooze") && (
            <form action={recordDecisionAction}>
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="action" value="snooze" />
              <label className="field">Snooze until
                <input name="snoozeUntil" type="date" required />
              </label>
              <label className="field">Note
                <input name="note" />
              </label>
              <button className="btn" type="submit">Snooze</button>
            </form>
          )}
          {actions.includes("Mark resolved") && (
            <form action={recordDecisionAction}>
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="action" value="resolve" />
              <label className="field">What was done
                <input name="note" required />
              </label>
              <button className="btn p" type="submit">Mark resolved</button>
            </form>
          )}
        </div>
      )}
      {audits.length > 0 && (
        <section>
          <h2>Audit</h2>
          <ul>
            {audits.map((entry) => (
              <li key={entry.id}>
                <b>{entry.action}</b> by {entry.who} at {entry.at}
                {entry.reason ? ` · ${entry.reason}` : ""}
                {entry.note ? ` · ${entry.note}` : ""}
                {entry.snoozeUntil ? ` · until ${entry.snoozeUntil}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

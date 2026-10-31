import Link from "next/link";
import { DRILL_LEVELS } from "@/lib/marketing/audience-source";
import type { exampleControl, exampleDrill, exampleLineage } from "@/lib/marketing/segments/example";
import { TOOLTIPS, lineageNote, testResultHeadline, type BoardRow } from "@/lib/marketing/segments/present";
import { answerSegmentDecision } from "@/lib/marketing/segments/actions";

type Board = ReturnType<typeof import("@/lib/marketing/segments/example").exampleBoard>;

function Tip({ label, text }: { label: string; text: string }) {
  const id = `tip-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button type="button" className="grid h-6 w-6 place-items-center rounded-full border border-muted text-[11px] text-muted" aria-label={`What is ${label}?`} aria-describedby={id}>?</button>
      <span role="tooltip" id={id} className="pointer-events-none absolute left-0 top-7 z-10 hidden w-60 rounded-lg bg-ink p-2 text-left text-xs font-normal normal-case tracking-normal text-on-ink group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}

function Chip({ chip }: { chip: BoardRow["chip"] }) {
  const tone = chip === "SCALE" ? "bg-success-soft text-success" : chip === "CUT" ? "bg-danger-soft text-danger" : chip === "TEST MORE" ? "bg-warning-soft text-warning" : "border border-dashed border-muted text-muted";
  const mark = chip === "SCALE" ? "▲" : chip === "CUT" ? "▼" : chip === "TEST MORE" ? "◆" : "…";
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tone}`}>{mark} {chip}</span>;
}

function Bars({ count }: { count: number }) {
  return (
    <span className="mr-1 inline-flex gap-0.5 align-middle" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={`inline-block h-3 w-1.5 rounded-sm ${index < count ? "bg-ink" : "bg-line"}`} />
      ))}
    </span>
  );
}

export function AudienceCrumb({ page }: { page: string }) {
  return (
    <nav className="crumb mb-3 text-sm text-muted" aria-label="Breadcrumb">
      <a href="/marketing/segments">Audience Data</a>
      <span className="sep"> › </span>
      <b aria-current="page">{page}</b>
    </nav>
  );
}

export function SegmentTabs({ current }: { current: "board" | "lineage" | "tests" }) {
  const tabs = [
    ["/marketing/segments", "Leaderboard", current === "board"],
    ["/marketing/segments/lineage", "Lineage", current === "lineage"],
    ["/marketing/segments/tests", "Tests", current === "tests"],
  ] as const;
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Audience Data">
      {tabs.map(([href, label, on]) => (
        <Link key={href} href={href} role="tab" aria-selected={on} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm ${on ? "border-ink bg-ink text-on-ink" : "border-line"}`}>{label}</Link>
      ))}
    </div>
  );
}

export function ExampleBadge() {
  return <span className="rounded bg-ink px-2 py-1 text-[11px] font-semibold tracking-wide text-on-ink">EXAMPLE DATA</span>;
}

export function SegmentLeaderboard({ board, staff }: { board: Board; staff: boolean }) {
  return (
    <div>
      <AudienceCrumb page="Leaderboard" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{staff ? "Staff view" : "Client view"} · Last 30 days</p>
          <h1 className="text-2xl font-semibold tracking-tight">{board.headline}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExampleBadge />
          <nav className="flex flex-wrap gap-2" aria-label="Audience source">
            {board.filters.map((filter) => (
              <Link key={filter.id} href={`/marketing/segments?source=${filter.id}`} className="inline-flex min-h-11 items-center rounded-full border border-ink bg-ink px-3 text-sm text-on-ink" aria-current="true">{filter.label}</Link>
            ))}
          </nav>
          {(["conversion", "quality", "revenue"] as const).map((sort) => (
            <Link key={sort} href={`/marketing/segments?sort=${sort}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">{sort === "conversion" ? "Conv. rate" : sort === "quality" ? "Lead quality" : "Revenue"}</Link>
          ))}
        </div>
      </div>
      <SegmentTabs current="board" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Segment</th>
              <th className="px-2 py-2">Audience source</th>
              <th className="px-2 py-2">Conv. rate <Tip label="Conv. rate" text={TOOLTIPS.conversionRate} /></th>
              <th className="px-2 py-2">Lead quality <Tip label="Lead quality" text={TOOLTIPS.leadQuality} /></th>
              <th className="px-2 py-2">Revenue <Tip label="Revenue" text={TOOLTIPS.revenue} /></th>
              {staff ? <th className="px-2 py-2">Vendor</th> : null}
              {staff ? <th className="px-2 py-2">Match rate</th> : null}
              {staff ? <th className="px-2 py-2">CPL <span className="rounded border border-line px-1">STAFF</span> <Tip label="CPL" text={TOOLTIPS.cpl} /></th> : null}
              {staff ? <th className="px-2 py-2">CPA <span className="rounded border border-line px-1">STAFF</span> <Tip label="CPA" text={TOOLTIPS.cpa} /></th> : null}
              <th className="px-2 py-2">Confidence <Tip label="Confidence" text={TOOLTIPS.confidence} /></th>
              <th className="px-2 py-2">Sample <Tip label="Sample" text={TOOLTIPS.sample} /></th>
              <th className="px-2 py-2">Recommends</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.key} className={row.rank == null ? "text-muted" : ""}>
                <td className="border-b border-line px-2 py-3 font-mono">{row.rank ?? "—"}</td>
                <td className="border-b border-line px-2 py-3">
                  <Link href={`/marketing/segments/drill?segment=${row.key}`} className="font-semibold text-ink">{row.name}</Link>
                  <div className="text-xs text-muted">{row.parent}</div>
                </td>
                <td className="border-b border-line px-2 py-3">{row.audienceSourceLabel}</td>
                <td className="border-b border-line px-2 py-3">{row.conversionRate}</td>
                <td className="border-b border-line px-2 py-3">{row.leadQuality}</td>
                <td className="border-b border-line px-2 py-3">{row.revenue}</td>
                {staff ? <td className="border-b border-line px-2 py-3">{row.vendor}</td> : null}
                {staff ? <td className="border-b border-line px-2 py-3">{row.matchRateLabel}{row.holdLabel ? <div className="mt-1 text-xs font-semibold text-warning">{row.holdLabel}</div> : null}</td> : null}
                {staff ? <td className="border-b border-line px-2 py-3">{row.cpl}</td> : null}
                {staff ? <td className="border-b border-line px-2 py-3">{row.cpa}</td> : null}
                <td className="border-b border-line px-2 py-3 whitespace-nowrap"><Bars count={row.confidenceBars} />{row.confidence}</td>
                <td className="border-b border-line px-2 py-3">
                  {row.sample}
                  <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded bg-line" role="img" aria-label={`${Math.round(row.sampleRatio * 100)}% of minimum sample`}>
                    <span className="block h-full bg-ink" style={{ width: `${Math.round(row.sampleRatio * 100)}%` }} />
                  </span>
                </td>
                <td className="border-b border-line px-2 py-3 text-left">
                  <Chip chip={row.chip} />
                  <p className="mt-1 max-w-xs text-xs text-muted">{row.reason}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">MAID lists only. Ranked by conversion rate, then lead quality, then revenue. A list needs 100 verified-human conversions and 7 days before it can win.{staff ? " A match rate under 30% shows On hold: low match rate." : ""} Nothing here changes a campaign amount.</p>
    </div>
  );
}

export function SegmentLineageView({ nodes, staff }: { nodes: ReturnType<typeof exampleLineage>; staff: boolean }) {
  return (
    <div>
      <AudienceCrumb page="Lineage" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{staff ? "Lineage · vendor and list id travel with every MAID row" : "Lineage"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Where the verified conversions came from</h1>
        </div>
        <ExampleBadge />
      </div>
      <SegmentTabs current="lineage" />
      <p className="mb-3 text-sm text-muted">Read left to right on a wide screen, or top to bottom on a phone. The bar is that step&apos;s share of the step before.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {nodes.map((node) => (
          <article key={node.level} className="rounded-xl border border-ink p-3 shadow-[inset_3px_0_0_var(--brand)]">
            <p className="text-[11px] uppercase tracking-wide text-muted">{node.level}</p>
            <h2 className="font-semibold">{node.label}</h2>
            <p className="text-sm text-muted">{node.detail}</p>
            <p className="mt-1 font-mono text-lg">{node.count}</p>
            {staff ? <p className="text-xs text-muted">{node.vendor} · list {node.listId}</p> : null}
            <div className="mt-2 h-2 rounded bg-line"><div className="h-full rounded bg-brand" style={{ width: `${Math.round(node.share * 100)}%` }} /></div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-sm">{lineageNote({ staff, listId: nodes[0]?.listId ?? "", vendor: nodes[0]?.vendor ?? "" })}</p>
    </div>
  );
}

export function SegmentDrillView({ drill }: { drill: ReturnType<typeof exampleDrill> }) {
  return (
    <div>
      <AudienceCrumb page="Drill-down" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">One attribute at a time. Order: {DRILL_LEVELS.join(" → ")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Groups that beat this audience</h1>
        </div>
        <ExampleBadge />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {DRILL_LEVELS.map((level) => (
          <Link key={level} href={`/marketing/segments/drill?level=${level}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-3 text-sm">{level.replace("_", " ")}</Link>
        ))}
      </div>
      {drill.split ? (
        <div className="grid gap-3 md:grid-cols-2">
          {drill.surfaced.map((child) => (
            <article key={child.key} className="rounded-xl border border-line border-l-4 border-l-success p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">{child.attribute}</p>
                <Chip chip="TEST MORE" />
              </div>
              <h2 className="mt-1 font-semibold">{child.value}</h2>
              <p className="mt-2 text-sm">Lift {child.lift.toFixed(1)}× · {Math.round(child.probability * 100)}% chance it beats the parent</p>
              <p className="mt-2 text-sm"><b>Why it converts:</b> {child.reason}</p>
              <p className="mt-2 text-xs text-muted">New sub-segments start as a test. This is a likely reason, not proof.</p>
            </article>
          ))}
        </div>
      ) : <p className="rounded-xl border border-line p-4 text-sm">{drill.reason}</p>}
      <p className="mt-3 text-sm text-muted">Only groups that beat the parent, with enough verified conversions, are shown. platform-native is not a target. Groups can overlap.</p>
    </div>
  );
}

export function SegmentTestView({ test, staff }: { test: ReturnType<typeof exampleControl>; staff: boolean }) {
  const winner = test.arms.find((arm) => arm.key === test.judgment.winnerKey);
  const ready = test.judgment.status === "winner";
  return (
    <div>
      <AudienceCrumb page="Tests" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Head-to-head · control is the {test.kind === "current_best" ? "current best list" : "chosen baseline list"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {testResultHeadline({ staff, ready, vendor: winner?.arm.vendor ?? "", listId: winner?.arm.listId ?? "" })}
          </h1>
        </div>
        <div className="flex items-center gap-2"><ExampleBadge /><span className="rounded border border-line px-2 py-1 text-xs font-semibold">{test.judgment.label.toUpperCase()}</span></div>
      </div>
      <SegmentTabs current="tests" />
      <div className="mb-4 flex h-10 overflow-hidden rounded-lg text-xs font-semibold">
        {test.arms.map((arm, index) => (
          <div key={arm.key} className={`flex items-center px-2 ${index === 0 ? "bg-ink text-on-ink" : "bg-line text-ink"}`} style={{ width: `${100 / test.arms.length}%` }}>
            {arm.arm.role} · {arm.arm.listId}
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] uppercase text-muted">
              <th className="py-2">List</th>
              <th>Verified-human conversions <Tip label="Sample" text={TOOLTIPS.sample} /></th>
              <th>Conv. rate <Tip label="Conv. rate" text={TOOLTIPS.conversionRate} /></th>
              <th>Chance to be best <Tip label="Confidence" text={TOOLTIPS.confidence} /></th>
            </tr>
          </thead>
          <tbody>
            {test.arms.map((arm) => (
              <tr key={arm.key} className="border-b border-line">
                <td className="py-3">{staff ? <b>{arm.arm.vendor}</b> : null} list {arm.arm.listId}{arm.arm.subSegmentKey ? ` · ${arm.arm.subSegmentKey}` : ""} <span className="text-muted">({arm.arm.role})</span></td>
                <td>{arm.successes} of {test.judgment.requiredConversions} verified-human conversions</td>
                <td>{((arm.successes / arm.trials) * 100).toFixed(1)}%</td>
                <td>{ready ? `${Math.round((test.judgment.probabilities[arm.key] ?? 0) * 100)}%` : "Hidden until the minimum is met"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">{ready ? "Both the 95% bar and the two-proportion check were met, after 100 verified-human conversions and 7 days." : "No winner until each list has 100 verified-human conversions, the test has run 7 days, the chance to be best is at least 95%, and the two-proportion p-value is under 0.05."}</p>
      <p className="mt-2 text-xs text-muted">Based on: MAID lists compared with each other. The control is the current best list, or a baseline list a person chose.</p>
    </div>
  );
}

export function SegmentDecisions({
  cards,
  logged,
}: {
  cards: { id: string; type: "segment_scale" | "segment_test" | "segment_cut"; title: string; summary: string; basedOn: string; vendor: string; listId: string }[];
  logged: { steps: string[]; undo: boolean; type: string } | null;
}) {
  return (
    <div>
      <AudienceCrumb page="Decisions" />
      <div className="mb-4 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audience Data</h1>
        <ExampleBadge />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <article key={card.id} className="rounded-xl border border-line p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Segment · {card.type.replace("segment_", "")} · {card.vendor} list {card.listId}</p>
            <h2 className="mt-1 font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-muted">{card.summary}</p>
            <p className="mt-2 text-xs text-muted">{card.basedOn}</p>
            <p className="mt-2 rounded-lg border border-dashed border-warning p-2 text-sm">Yes logs the decision and shows the steps to do it by hand. Nothing is sent to an ad account.</p>
            {card.type === "segment_cut" ? (
              <p className="mt-2 text-sm">Dry run · confirm preview: pause {card.vendor} list {card.listId} by hand. Nothing is sent.</p>
            ) : null}
            <form action={answerSegmentDecision} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="type" value={card.type} />
              <input type="hidden" name="vendor" value={card.vendor} />
              <input type="hidden" name="listId" value={card.listId} />
              {card.type === "segment_cut" ? (
                <label className="flex w-full items-start gap-2 text-sm">
                  <input type="checkbox" name="confirmPreview" value="dry-run" required className="mt-1" />
                  <span>Dry run · confirm preview before Yes, cut.</span>
                </label>
              ) : null}
              <button name="decision" value="accept" className="btn-brand min-h-11 rounded-lg px-3">{card.type === "segment_cut" ? "Yes, cut" : "Yes"}</button>
            </form>
            <form action={answerSegmentDecision} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="type" value={card.type} />
              <input type="hidden" name="vendor" value={card.vendor} />
              <input type="hidden" name="listId" value={card.listId} />
              <button name="decision" value="decline" className="min-h-11 rounded-lg border border-line px-3">No</button>
              <Link href="/marketing/segments/tests" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">See test</Link>
            </form>
          </article>
        ))}
        <article className="rounded-xl border border-line p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted">RECOMMENDATION ONLY</p>
          <h2 className="mt-1 font-semibold">A person changes the campaign amount, if they want to.</h2>
          <p className="mt-2 text-sm text-muted">This card does not write that amount. Mark it only after you have done it yourself.</p>
          <form action={answerSegmentDecision} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="type" value="budget_rec" />
            <button name="decision" value="accept" className="btn-brand min-h-11 rounded-lg px-3">I made the change</button>
            <button name="decision" value="decline" className="min-h-11 rounded-lg border border-line px-3">Decline</button>
          </form>
        </article>
      </div>
      {logged ? (
        <div className="mt-4 rounded-xl bg-ink p-4 text-sm text-on-ink" role="status">
          <p>Logged. No ad account was changed.</p>
          <ol className="mt-2 list-decimal pl-5">
            {logged.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          {logged.undo ? (
            <form action={answerSegmentDecision} className="mt-3">
              <input type="hidden" name="decision" value="undo" />
              <button className="min-h-11 font-semibold text-brand">Undo</button>
            </form>
          ) : <p className="mt-2">The undo window has closed.</p>}
        </div>
      ) : null}
    </div>
  );
}

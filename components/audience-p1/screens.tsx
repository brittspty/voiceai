import Link from "next/link";
import type { presentDrill } from "@/lib/marketing/audience-p1/drill";
import type { presentLineage } from "@/lib/marketing/audience-p1/lineage";
import type { presentTests } from "@/lib/marketing/audience-p1/head-to-head";
import type { presentThresholds } from "@/lib/marketing/audience-p1/thresholds";
import { DecideButtons } from "./decide-button";

function Chip({ chip }: { chip: string }) {
  const mark = chip === "SCALE" ? "▲" : chip === "CUT" ? "▼" : chip === "TEST MORE" ? "◆" : "…";
  return <span className="ap-chip">{mark} {chip}</span>;
}

function Nav() {
  return (
    <nav className="ap-nav" aria-label="Audience Data P1">
      <Link className="ap-hit" href="/audience-data/lineage">Lineage</Link>
      <Link className="ap-hit" href="/audience-data/drill">Drill-down</Link>
      <Link className="ap-hit" href="/audience-data/tests">Head-to-head</Link>
      <Link className="ap-hit" href="/settings/audience-thresholds">Thresholds</Link>
    </nav>
  );
}

export function LineageScreen({ model }: { model: ReturnType<typeof presentLineage> }) {
  return (
    <main className="ap">
      <Nav />
      <p className="muted">Audience Data · lineage</p>
      <h1>Where the verified conversions came from</h1>
      <span className="ap-banner">{model.banner}</span>
      <p>{model.pathSummary}</p>
      <p><b>{model.basedOn}</b></p>
      <div className="ap-lineage" data-mobile={model.mobile}>
        {model.columns.map((column) => (
          <section key={column.id} className="ap-step" aria-label={`Step ${column.step}: ${column.title}`}>
            <h2>{column.step}. {column.title}</h2>
            {column.nodes.map((node) => (
              <Link key={node.id} className="ap-hit ap-node" href={node.href} aria-pressed={node.selected} aria-current={node.selected ? "page" : undefined}>
                <span>{node.label}</span>
                <span>{node.count.toLocaleString("en-US")} · {Math.round(node.shareOfParent * 100)}% of parent</span>
                <span className="ap-bar" role="img" aria-label={`${Math.round(node.shareOfParent * 100)} percent of the parent`}>
                  <span style={{ width: `${Math.round(node.shareOfParent * 100)}%` }} />
                </span>
              </Link>
            ))}
          </section>
        ))}
      </div>
      <table>
        <caption>Lineage counts for the selected path</caption>
        <thead><tr><th>Step</th><th>Name</th><th>Count</th><th>Share of parent</th></tr></thead>
        <tbody>
          {model.columns.map((column) => {
            const node = column.nodes.find((item) => item.selected) ?? column.nodes[0];
            if (!node) return null;
            return (
              <tr key={column.id}>
                <td>{column.title}</td>
                <td>{node.label}</td>
                <td>{node.count.toLocaleString("en-US")}</td>
                <td>{Math.round(node.shareOfParent * 100)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

export function DrillScreen({ model }: { model: ReturnType<typeof presentDrill> }) {
  return (
    <main className="ap">
      <Nav />
      <p className="muted">One dimension at a time · {model.parentLabel}</p>
      <h1>{model.title}</h1>
      <span className="ap-banner">{model.banner}</span>
      <nav className="ap-nav" aria-label="Drill dimensions">
        {model.dimensions.map((item) => (
          <Link key={item.id} className="ap-hit" href={item.href} aria-current={item.selected ? "page" : undefined}>{item.title}</Link>
        ))}
      </nav>
      <div className="ap-grid">
        {model.rows.map((row) => (
          <article key={row.id} className="ap-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <h2>{row.name}</h2>
              <Chip chip={row.chip} />
            </div>
            <p>Lift vs parent: {row.liftLabel}</p>
            <p>Sample: {row.sampleLabel}</p>
            <p>Confidence: {row.confidence} · {row.confidenceBars} of 5 bars</p>
            <p><b>{row.whyLabel}:</b> {row.why}</p>
            <p className="muted">{row.basedOn}</p>
          </article>
        ))}
      </div>
      <p>{model.overlapNote}</p>
      <table>
        <caption>{model.title} compared with the parent</caption>
        <thead><tr><th>Group</th><th>Lift vs parent</th><th>Sample</th><th>Confidence</th><th>Recommends</th></tr></thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.liftLabel}</td>
              <td>{row.sampleLabel}</td>
              <td>{row.confidence}</td>
              <td>{row.chip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export function TestsScreen({ model, staff }: { model: ReturnType<typeof presentTests>; staff: boolean }) {
  return (
    <main className="ap">
      <Nav />
      <p className="muted">{model.title}</p>
      <h1>Head-to-head tests</h1>
      <span className="ap-banner">{model.banner}</span>
      <p>{model.lockedNote}</p>
      <p>{model.manualNote}</p>
      <p><b>{model.basedOn}</b></p>
      <div className="ap-grid">
        {model.tests.map((test) => (
          <article key={test.id} className="ap-card" aria-label={test.label}>
            <h2>{test.label}{test.dayLabel ? ` · ${test.dayLabel}` : ""}</h2>
            <p>{test.summary}</p>
            {test.holdLabel ? <p><b>{test.holdLabel}</b></p> : null}
            <ol>
              {test.checklist.map((line) => (
                <li key={line.id}>{line.met ? "Met" : "Not met"} · {line.text}</li>
              ))}
            </ol>
            <table>
              <caption>{test.label} arms</caption>
              <thead><tr><th>List</th><th>Verified-human conversions</th><th>Conv. rate</th><th>Days</th></tr></thead>
              <tbody>
                {test.arms.map((arm) => (
                  <tr key={arm.key}>
                    <td>{arm.label}</td>
                    <td>{arm.successes}</td>
                    <td>{arm.rateLabel}</td>
                    <td>{arm.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {staff && <DecideButtons testId={test.id} status={test.status} onHold={test.onHold} canCut={test.arms.some((arm) => arm.canCut)} />}
          </article>
        ))}
      </div>
    </main>
  );
}

export function ThresholdScreen({ model }: { model: ReturnType<typeof presentThresholds> }) {
  return (
    <main className="ap">
      <Nav />
      <p className="muted">Settings · read only</p>
      <h1>{model.title}</h1>
      <p>{model.note}</p>
      <dl>
        {model.rows.map((row) => (
          <div key={row.id}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}

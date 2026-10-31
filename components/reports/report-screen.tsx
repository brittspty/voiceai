"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { REPORT_LOGO_ALT, REPORT_LOGO_REVERSED, REPORT_PRODUCT } from "@/lib/marketing/reports/brand";
import { formatKpi, formatUpdatedEt } from "@/lib/marketing/reports/format";
import { easeOutCubic, REPORT_MOTION, shouldAnimate } from "@/lib/marketing/reports/motion";
import { reportHref } from "@/lib/marketing/reports/query";
import type { ClientReport, FlagKind, KpiFormat, ReportCompare, ReportDocument, ReportRange, StaffReport } from "@/lib/marketing/reports/types";
import { ChannelChart, CohortChart, FunnelChart, Sparkline, TrendChart, useReducedMotion, type ChartSeries } from "./charts";
import { ShareDialog } from "./share-dialog";

const RANGES: ReportRange[] = ["7d", "30d", "qtd", "custom"];

function flagLabel(kind: FlagKind) {
  if (kind === "anomaly") return "Anomaly";
  if (kind === "opportunity") return "Opportunity";
  if (kind === "heads_up") return "Heads up";
  return "Up";
}

function Flags({ heading, count, flags }: { heading: string; count?: number; flags: { id: string; kind: FlagKind; title: string; detail: string; href?: string }[] }) {
  return (
    <section className="jr-panel">
      <div className="jr-ph">
        <h2>{heading}</h2>
        {typeof count === "number" && <span className="jr-lbl">{count} open</span>}
      </div>
      {flags.map((flag) => {
        const body = (
          <>
            <b>{flag.title}</b>
            <div className="jr-sub">{flag.detail}</div>
          </>
        );
        return (
          <div key={flag.id} className="jr-flag">
            <span className={`jr-tag ${flag.kind}`}>{flagLabel(flag.kind)}</span>
            <div>{flag.href ? <Link href={flag.href}>{body}</Link> : body}</div>
          </div>
        );
      })}
      {!flags.length && <p className="jr-sub">No open flags.</p>}
    </section>
  );
}

function sparkColor(id: string, index: number, format: KpiFormat) {
  if (index === 0) return "var(--jr-or)";
  if (id === "speed") return "var(--jr-down)";
  if (format === "rating") return "var(--jr-blue)";
  return "var(--jr-tx)";
}

function CountUp({ value, format, replayKey, reduce }: { value: number; format: KpiFormat; replayKey: string; reduce: boolean }) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const keyRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const keyChanged = keyRef.current !== replayKey;
    const valueChanged = valueRef.current !== value;
    keyRef.current = replayKey;
    valueRef.current = value;
    const paint = (next: number) => {
      node.textContent = formatKpi(next, format);
    };
    if (!keyChanged && valueChanged) {
      paint(value);
      if (shouldAnimate(reduce)) {
        node.classList.remove("jr-hot");
        void node.offsetWidth;
        node.classList.add("jr-hot");
      }
      return;
    }
    if (!keyChanged || !shouldAnimate(reduce)) {
      paint(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / REPORT_MOTION.countUpMs);
      paint(value * easeOutCubic(k));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, format, replayKey, reduce]);
  return <span ref={nodeRef}>{formatKpi(value, format)}</span>;
}

function asSeries(report: ReportDocument): ChartSeries[] {
  return report.series.map((item) => ({
    id: item.id,
    title: item.title,
    unit: item.unit,
    goal: item.goal,
    goalLabel: item.goalLabel,
    points: item.points.map((point) => ({
      date: point.date,
      label: point.label,
      value: point.value,
      prior: point.prior,
      splitText: "splitText" in point ? point.splitText : point.staffSplitText || "",
      splits: point.splits.map((split) => ({ name: "name" in split ? split.name : split.clientName, value: split.value })),
      staffNote: report.audience === "staff" && "staffNote" in point ? point.staffNote : undefined,
    })),
  }));
}

function channelBars(report: ReportDocument) {
  if (report.audience === "staff") {
    return report.channels.map((row) => ({
      name: row.staffName,
      value: row.qualified,
      color: row.color,
      detail: `${row.qualified} qualified · ${row.leads} leads · CPL ${row.cpl == null ? "n/a" : `$${row.cpl.toFixed(2)}`}`,
    }));
  }
  return report.channels.map((row) => ({
    name: row.name,
    value: row.qualified,
    color: row.color,
    detail: `${row.qualified} qualified · ${row.leads} leads`,
  }));
}

export function ReportScreen({
  initial,
  mode,
  canShare,
  canStaffPdf,
  pdfDefault,
  pollUrl,
  shareOpen = false,
}: {
  initial: ReportDocument;
  mode: "app" | "share";
  canShare: boolean;
  canStaffPdf: boolean;
  pdfDefault: "staff" | "client";
  pollUrl: string | null;
  shareOpen?: boolean;
}) {
  const reduce = useReducedMotion();
  const [report, setReport] = useState(initial);
  const [seriesId, setSeriesId] = useState(initial.defaultSeriesId);
  const [share, setShare] = useState(shareOpen);
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [tip, setTip] = useState("");
  const replayKey = `${report.range}:${report.compare}:${report.clientId}`;

  useEffect(() => {
    const apply = () => setOffline(!navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  useEffect(() => {
    if (!pollUrl) return;
    let timer = 0;
    const pull = async () => {
      const response = await fetch(pollUrl, { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as ReportDocument;
      setReport((prev) => {
        const before = prev.kpis[0];
        const after = next.kpis[0];
        if (before && after && before.value !== after.value) {
          setLiveMessage(`${after.label} now ${formatKpi(after.value, after.format)}`);
        }
        return next;
      });
    };
    const start = () => {
      timer = window.setInterval(() => {
        if (!document.hidden) void pull();
      }, REPORT_MOTION.pollMs);
    };
    const onVis = () => {
      window.clearInterval(timer);
      if (!document.hidden) {
        void pull();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pollUrl]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const updated = formatUpdatedEt(report.updatedAt);
  const query = new URLSearchParams({
    range: report.range,
    compare: report.compare,
    client: report.clientId,
    view: report.audience,
  }).toString();
  const staff = report.audience === "staff" ? (report as StaffReport) : null;
  const client = report.audience === "client" ? (report as ClientReport) : null;
  const clients = staff?.clients ?? [];
  const series = useMemo(() => asSeries(report), [report]);
  const bars = useMemo(() => channelBars(report), [report]);
  const annotation = report.annotations.find((note) => note.seriesId === seriesId) ?? report.annotations[0] ?? null;
  const funnelTitle = report.funnel[0]?.label === "Visits" ? "From visit to appointment" : "Funnel";

  const go = (patch: { range?: ReportRange; compare?: ReportCompare; clientId?: string; view?: "staff" | "client"; start?: string; end?: string }) => {
    const href = reportHref({
      range: patch.range ?? report.range,
      compare: patch.compare ?? report.compare,
      clientId: patch.clientId ?? report.clientId,
      view: patch.view ?? report.audience,
      start: patch.start ?? (report.range === "custom" ? undefined : undefined),
      end: patch.end,
    });
    window.location.assign(href);
  };

  return (
    <div className="jr-wrap">
      <p className="jr-sr" aria-live="polite">{liveMessage}</p>
      <header className="jr-top">
        <div className="jr-brand">
          <Image src={REPORT_LOGO_REVERSED} alt={REPORT_LOGO_ALT} width={148} height={30} priority />
          <div className="jr-product">
            {REPORT_PRODUCT}
            <span>{report.footer.split("·").slice(1).join("·").trim()}</span>
          </div>
        </div>
        <div className="jr-ctl">
          {report.exampleData && <span className="jr-ex">EXAMPLE DATA</span>}
          <span className={`jr-live ${offline ? "offline" : updated.stale ? "stale" : ""}`}>
            {offline ? "Offline" : updated.stale ? updated.text : `Live · ${updated.text}`}
          </span>
          {mode === "app" && (
            <div className="jr-seg" aria-label="Range">
              {RANGES.map((range) => (
                <Link key={range} href={reportHref({ range, compare: report.compare, clientId: report.clientId, view: report.audience })} aria-current={report.range === range ? "true" : undefined}>
                  {range === "7d" ? "7D" : range === "30d" ? "30D" : range === "qtd" ? "QTD" : "Custom"}
                </Link>
              ))}
            </div>
          )}
          {mode === "app" && (
            <select className="jr-select" aria-label="Compare" value={report.compare} onChange={(event) => go({ compare: event.target.value === "none" ? "none" : "prior" })}>
              <option value="prior">Compare: {report.compare === "prior" ? report.compareLabel : "prior period"}</option>
              <option value="none">Compare: none</option>
            </select>
          )}
          {mode === "app" && staff && (
            <select className="jr-select" aria-label="Client" value={report.clientId} onChange={(event) => go({ clientId: event.target.value })}>
              {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          {mode === "app" && canShare && <button type="button" className="jr-btn" onClick={() => setShare(true)}>Share link</button>}
          {mode === "app" && (
            <button type="button" className="jr-btn primary" onClick={() => (canShare ? setShare(true) : void downloadNow(query, report.audience, setToast))}>
              Export PDF
            </button>
          )}
        </div>
      </header>
      {mode === "app" && report.range === "custom" && (
        <form className="jr-dates" style={{ marginTop: 12 }} action="/reports">
          <input type="hidden" name="range" value="custom" />
          <input type="hidden" name="compare" value={report.compare} />
          <input type="hidden" name="client" value={report.clientId} />
          <input type="hidden" name="view" value={report.audience} />
          <input type="date" name="start" aria-label="Start date" defaultValue="2026-10-01" />
          <input type="date" name="end" aria-label="End date" defaultValue="2026-10-30" />
          <button className="jr-btn" type="submit">Apply</button>
        </form>
      )}
      <h1 className="jr-h1">{report.headline}</h1>
      <p className="jr-sub">{report.subhead}</p>
      <section className="jr-hero" aria-label="Headline results">
        {report.kpis.map((kpi, index) => (
          <article key={kpi.id} className={index === 0 ? "jr-k big" : "jr-k"}>
            <span className="jr-lbl">
              <button type="button" className="jr-lbl" aria-expanded={tip === kpi.id} onClick={() => setTip((current) => (current === kpi.id ? "" : kpi.id))} onKeyDown={(event) => { if (event.key === "Escape") setTip(""); }}>
                {kpi.label}
              </button>
              {"staffOnly" in kpi && kpi.staffOnly ? <span className="jr-lock">STAFF</span> : null}
            </span>
            {tip === kpi.id && <span className="jr-def" role="tooltip">{kpi.definition}</span>}
            <div className="jr-v">
              <CountUp value={kpi.value} format={kpi.format} replayKey={replayKey} reduce={reduce} />
            </div>
            <div className={`jr-delta ${kpi.tone}`}>{kpi.delta}</div>
            <Sparkline values={kpi.spark} color={sparkColor(kpi.id, index, kpi.format)} label={`${kpi.label} trend`} />
            {index === 0 && kpi.why && <p className="jr-why"><b>Why:</b> {kpi.why}</p>}
          </article>
        ))}
      </section>
      {staff ? (
        <>
          <div className="jr-g2">
            <TrendChart series={series} seriesId={seriesId} onSeries={setSeriesId} compare={report.compare === "prior"} reduce={reduce} annotation={annotation} />
            <Flags heading={report.flagsHeading} count={report.flags.length} flags={report.flags} />
          </div>
          <div className="jr-g3">
            <ChannelChart title={staff.channelHeading} metric={staff.channelMetric} bars={bars} />
            <FunnelChart title="Funnel" steps={report.funnel} />
            {staff.cohort && <CohortChart columns={staff.cohort.columns} rows={staff.cohort.rows} note={staff.cohort.note} />}
          </div>
        </>
      ) : (
        <>
          <div className="jr-g2">
            <TrendChart series={series} seriesId={seriesId} onSeries={setSeriesId} compare={report.compare === "prior"} reduce={reduce} annotation={annotation} />
            <ChannelChart title={report.channelHeading} bars={bars} note={client?.attribution} />
          </div>
          <div className="jr-g2">
            <FunnelChart title={funnelTitle} steps={report.funnel} />
            <Flags heading={report.flagsHeading} flags={report.flags} />
          </div>
        </>
      )}
      {staff && <p className="jr-attr">{staff.attribution}</p>}
      <footer className="jr-foot">
        <span>{report.footer}</span>
        <span>{report.exampleData ? "All figures are EXAMPLE DATA" : report.periodLabel}</span>
      </footer>
      {share && canShare && (
        <ShareDialog
          open={share}
          onClose={() => setShare(false)}
          query={query}
          canStaffPdf={canStaffPdf}
          pdfDefault={pdfDefault}
          reduce={reduce}
          onToast={setToast}
        />
      )}
      {toast && <div className="jr-toast" role="status">{toast}</div>}
    </div>
  );
}

async function downloadNow(query: string, view: "staff" | "client", setToast: (message: string) => void) {
  setToast("Building your report…");
  const params = new URLSearchParams(query);
  params.set("view", view);
  const response = await fetch(`/api/marketing/reports/export?${params.toString()}`);
  if (!response.ok) {
    setToast("Could not build the PDF. Retry");
    return;
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "jarvis-report.pdf";
  anchor.click();
  URL.revokeObjectURL(href);
  setToast("Report ready");
}

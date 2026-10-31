"use client";

import { useEffect, useId, useRef, useState } from "react";
import { REPORT_MOTION } from "@/lib/marketing/reports/motion";
import { formatKpi, pointTitle } from "@/lib/marketing/reports/format";

export type ChartPoint = {
  date: string;
  label: string;
  value: number;
  prior: number;
  splitText: string;
  splits: { name: string; value: number }[];
  staffNote?: string;
};

export type ChartSeries = {
  id: string;
  title: string;
  unit: string;
  goal: number | null;
  goalLabel: string;
  points: ChartPoint[];
};

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduce;
}

export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (!values.length) return null;
  const width = 200;
  const height = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - 2 - ((value - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="jr-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

function fontOf(node: HTMLElement) {
  const style = getComputedStyle(node);
  return {
    mono: style.getPropertyValue("--font-report-mono").trim() || "IBM Plex Mono, ui-monospace, monospace",
    sans: style.getPropertyValue("--font-brand").trim() || "Poppins, sans-serif",
  };
}

function palette(node: HTMLElement) {
  const style = getComputedStyle(node);
  const pick = (name: string) => style.getPropertyValue(name).trim();
  return {
    orange: pick("--jr-or"),
    ink: pick("--jr-ink"),
    text: pick("--jr-tx"),
    muted: pick("--jr-mu"),
    line: pick("--jr-line"),
    blue: pick("--jr-blue"),
    up: pick("--jr-up"),
    down: pick("--jr-down"),
    prior: pick("--jr-prior"),
    tip: pick("--jr-tip"),
    tipLine: pick("--jr-tip-line"),
    grid: pick("--jr-grid"),
    scrub: pick("--jr-scrub"),
    scrubLine: pick("--jr-scrub-line"),
    deep: pick("--jr-deep"),
    funnel1: pick("--jr-funnel-1"),
    funnel2: pick("--jr-funnel-2"),
    heat: [pick("--jr-heat-0"), pick("--jr-heat-1"), pick("--jr-heat-2"), pick("--jr-heat-3")],
  };
}

function seriesLabel(id: string, title: string) {
  if (id === "qualified") return "Qualified";
  if (id === "cpql") return "CPQL";
  if (id === "visits") return "Visits";
  if (id === "leads") return "Leads";
  if (id === "booked") return "Booked";
  return title.split(" ")[0] || title;
}

export function TrendChart({
  series,
  seriesId,
  onSeries,
  compare,
  reduce,
  annotation,
}: {
  series: ChartSeries[];
  seriesId: string;
  onSeries: (id: string) => void;
  compare: boolean;
  reduce: boolean;
  annotation?: { label: string; body: string } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<import("echarts").ECharts | null>(null);
  const [table, setTable] = useState(false);
  const [pinFor, setPinFor] = useState<{ seriesId: string; index: number | null } | null>(null);
  const [focus, setFocus] = useState(0);
  const labelId = useId();
  const active = series.find((item) => item.id === seriesId) ?? series[0];
  const featured = active?.points.findIndex((point) => point.splitText) ?? -1;

  const pinned = pinFor?.seriesId === seriesId ? pinFor.index : featured >= 0 ? featured : null;
  const pin = (index: number | null) => setPinFor({ seriesId, index });

  useEffect(() => {
    const node = host.current;
    if (!node || !active) return;
    let dead = false;
    const fonts = fontOf(node);
    const color = palette(node);
    const featuredIndex = active.points.findIndex((point) => point.splitText);
    void import("echarts")
      .then((echarts) => {
      if (dead) return;
      const chart = echarts.init(node, undefined, { renderer: "svg" });
      chartRef.current = chart;
      const goal = active.goal;
      chart.setOption({
        animationDuration: reduce ? 0 : REPORT_MOTION.drawInMs,
        animationDurationUpdate: reduce ? 0 : REPORT_MOTION.seriesMorphMs,
        animationEasing: "cubicOut",
        animationEasingUpdate: "cubicOut",
        aria: { enabled: true, label: { description: `${active.title}. ${active.points.length} days.` } },
        grid: { left: 46, right: 72, top: 28, bottom: 72 },
        tooltip: {
          trigger: "axis",
          backgroundColor: color.tip,
          borderColor: color.tipLine,
          textStyle: { color: color.text, fontFamily: fonts.sans, fontSize: 12 },
          transitionDuration: reduce ? 0 : REPORT_MOTION.tooltipInMs / 1000,
          extraCssText: "border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);",
          formatter: (raw: unknown) => {
            const rows = Array.isArray(raw) ? raw : [raw];
            const first = rows[0] as { dataIndex?: number; axisValue?: string };
            const point = active.points[first.dataIndex ?? 0];
            if (!point) return "";
            const delta = point.value - point.prior;
            const sign = delta >= 0 ? "▲" : "▼";
            const split = point.splitText || point.splits.map((item) => `${item.name} ${item.value}`).filter((item) => !item.endsWith(" 0")).join(" · ");
            const note = point.staffNote ? `<div style="color:${color.muted}">${point.staffNote}</div>` : "";
            return `<div style="font-family:${fonts.mono};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${color.muted}">${pointTitle(point.date)}</div><b style="font-size:18px">${formatKpi(point.value, "integer")} ${active.unit}</b><div style="color:${color.up}">${sign} ${Math.abs(delta)} vs same day prior</div><div style="color:${color.muted}">${split}</div>${note}`;
          },
        },
        xAxis: {
          type: "category",
          data: active.points.map((point) => point.label),
          axisLine: { lineStyle: { color: color.line } },
          axisLabel: { color: color.muted, fontFamily: fonts.mono, fontSize: 11 },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: color.grid } },
          axisLabel: { color: color.muted, fontFamily: fonts.mono, fontSize: 11 },
        },
        dataZoom: [
          { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: true },
          {
            type: "slider",
            height: 28,
            bottom: 8,
            borderColor: color.line,
            fillerColor: color.scrub,
            backgroundColor: color.scrub,
            handleStyle: { color: color.text },
            textStyle: { color: color.muted, fontFamily: fonts.mono, fontSize: 10 },
            dataBackground: { lineStyle: { color: color.scrubLine }, areaStyle: { color: "transparent" } },
          },
        ],
        series: [
          {
            name: "This period",
            type: "line",
            data: active.points.map((point) => point.value),
            symbol: "circle",
            symbolSize: 8,
            showSymbol: false,
            smooth: 0.25,
            lineStyle: { width: 2.5, color: color.orange, shadowColor: color.orange, shadowBlur: 8 },
            itemStyle: { color: color.orange },
            areaStyle: { color: color.orange, opacity: 0.16 },
            markLine: goal == null ? undefined : {
              symbol: "none",
              data: [{ yAxis: goal, label: { formatter: active.goalLabel, color: color.blue, fontFamily: fonts.mono, fontSize: 11 } }],
              lineStyle: { color: color.blue, type: "dashed", width: 1.5 },
            },
            markPoint: active.points.flatMap((point, index) =>
              point.splitText && index === featuredIndex
                ? [{ coord: [point.label, point.value], symbol: "circle", symbolSize: 12, itemStyle: { color: color.orange, borderColor: color.ink, borderWidth: 2 } }]
                : [],
            ),
          },
          ...(compare
            ? [{
                name: "Prior period",
                type: "line",
                data: active.points.map((point) => point.prior),
                symbol: "none",
                smooth: 0.2,
                lineStyle: { width: 1.5, color: color.prior, type: "dashed" },
              }]
            : []),
        ],
      });
      const onResize = () => chart.resize();
      const observer = new ResizeObserver(onResize);
      observer.observe(node);
      chart.on("click", (event: { dataIndex?: number }) => {
        if (typeof event.dataIndex === "number") setPinFor({ seriesId, index: event.dataIndex });
      });
      return () => observer.disconnect();
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "echarts failed");
    });
    return () => {
      dead = true;
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [active, compare, reduce, featured, seriesId]);

  const moveZoom = (direction: number, resize: boolean) => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.dispatchAction({
      type: "dataZoom",
      dataZoomIndex: 0,
      start: resize ? undefined : Math.max(0, direction > 0 ? 10 : 0),
      end: resize ? (direction > 0 ? 100 : 80) : undefined,
    });
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (!active) return;
    if (event.key === "Escape") {
      pin(null);
      chartRef.current?.dispatchAction({ type: "hideTip" });
      return;
    }
    if (event.key === "Enter") {
      pin(focus);
      chartRef.current?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: focus });
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (event.shiftKey) {
      chartRef.current?.dispatchAction({ type: "dataZoom", start: direction > 0 ? 15 : 0, end: direction > 0 ? 100 : 85 });
      return;
    }
    if (event.altKey) {
      moveZoom(direction, true);
      return;
    }
    const next = Math.min(active.points.length - 1, Math.max(0, focus + direction));
    setFocus(next);
    chartRef.current?.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: next });
  };

  if (!active) return <p className="jr-sub">No data yet: connect Meta.</p>;
  const note = active.points.find((point) => point.date.endsWith("-09")) ?? null;
  const noteIndex = note ? active.points.indexOf(note) : -1;
  const pinnedPoint = pinned != null ? active.points[pinned] : null;

  return (
    <section className="jr-panel" aria-labelledby={labelId}>
      <div className="jr-ph">
        <h2 id={labelId}>{active.title}</h2>
        <div className="jr-seg" role="tablist" aria-label="Metric">
          {series.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={item.id === active.id} onClick={() => onSeries(item.id)}>
              {seriesLabel(item.id, item.title)}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={host}
        className="jr-chart"
        tabIndex={0}
        role="img"
        aria-label={`${active.title}. Tab here, then use left and right arrows to move between days. Enter pins the tooltip. Escape closes it. Shift and arrows scrub the range.`}
        onKeyDown={onKey}
      />
      {annotation && noteIndex >= 0 && (
        <div className="jr-note-card" style={{ left: 36, top: 78 }}>
          <span className="jr-lbl">{annotation.label}</span>
          <div style={{ marginTop: 4 }}>{annotation.body}</div>
        </div>
      )}
      {pinnedPoint && pinnedPoint.splitText && (
        <div className="jr-tip" style={{ right: 24, top: 78 }}>
          <span className="jr-lbl">{pointTitle(pinnedPoint.date)}</span>
          <b>{formatKpi(pinnedPoint.value, "integer")} {active.unit}</b>
          <span className="jr-delta good">▲ {Math.abs(pinnedPoint.value - pinnedPoint.prior)} vs same day prior</span>
          <div className="jr-sub">{pinnedPoint.splitText}{pinnedPoint.staffNote ? ` · ${pinnedPoint.staffNote}` : ""}</div>
        </div>
      )}
      <div className="jr-legend">
        <span><b className="jr-swatch-current">━</b> This period</span>
        {compare && <span>┄ Prior period</span>}
        {active.goal != null && <span className="jr-swatch-goal">┄ Goal</span>}
        <button type="button" onClick={() => setTable((open) => !open)}>{table ? "Hide table" : "View as table"}</button>
      </div>
      <p className="jr-attr">Scroll or pinch to zoom · Shift+←/→ to scrub · Alt+←/→ resizes the window</p>
      {table && (
        <table className="jr-table">
          <caption className="jr-sr">{active.title} as a table</caption>
          <thead>
            <tr><th>Date</th><th>This period</th>{compare && <th>Prior</th>}<th>Split</th></tr>
          </thead>
          <tbody>
            {active.points.map((point) => (
              <tr key={point.date}>
                <td>{pointTitle(point.date)}</td>
                <td>{formatKpi(point.value, "integer")}</td>
                {compare && <td>{formatKpi(point.prior, "integer")}</td>}
                <td>{point.splitText}{point.staffNote ? ` · ${point.staffNote}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

type Bar = { name: string; detail: string; value: number; color: string };

export function ChannelChart({ title, metric, bars, note }: { title: string; metric?: string; bars: Bar[]; note?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    const node = host.current;
    if (!node || !bars.length) return;
    let dead = false;
    let chart: { dispose: () => void; setOption: (option: object) => void; resize: () => void } | null = null;
    const fonts = fontOf(node);
    const color = palette(node);
    void import("echarts").then((echarts) => {
      if (dead) return;
      chart = echarts.init(node, undefined, { renderer: "svg" });
      const max = Math.max(...bars.map((bar) => bar.value), 1);
      chart.setOption({
        animationDuration: 0,
        animationDurationUpdate: REPORT_MOTION.seriesMorphMs,
        aria: { enabled: true },
        grid: { left: 12, right: 24, top: 8, bottom: 8, containLabel: true },
        xAxis: { type: "value", max, show: false },
        yAxis: {
          type: "category",
          inverse: true,
          data: bars.map((bar) => bar.name),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: color.text, fontFamily: fonts.sans, fontSize: 13, width: 160, overflow: "truncate" },
        },
        series: [{
          type: "bar",
          barWidth: 8,
          data: bars.map((bar) => ({ value: bar.value, itemStyle: { color: bar.color, borderRadius: 4 } })),
          label: { show: false },
        }],
      });
      const observer = new ResizeObserver(() => chart?.resize());
      observer.observe(node);
    });
    return () => {
      dead = true;
      chart?.dispose();
    };
  }, [bars]);

  return (
    <section className="jr-panel">
      <div className="jr-ph">
        <h2>{title}</h2>
        {metric && <span className="jr-lbl">{metric}</span>}
      </div>
      <div
        ref={host}
        style={{ height: Math.max(180, bars.length * 56) }}
        tabIndex={0}
        role="img"
        aria-label={`${title}. ${bars.map((bar) => `${bar.name} ${bar.detail}`).join(". ")}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowRight") setFocus((index) => Math.min(bars.length - 1, index + 1));
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") setFocus((index) => Math.max(0, index - 1));
        }}
      />
      <p className="jr-attr" aria-live="polite">{bars[focus] ? `${bars[focus].name}: ${bars[focus].detail}` : ""}</p>
      {note && <p className="jr-attr">{note}</p>}
      <button type="button" className="jr-lbl" onClick={() => setTable((open) => !open)}>{table ? "Hide table" : "View as table"}</button>
      {table && (
        <table className="jr-table">
          <caption className="jr-sr">{title}</caption>
          <thead><tr><th>Source</th><th>Detail</th></tr></thead>
          <tbody>{bars.map((bar) => <tr key={bar.name}><td>{bar.name}</td><td>{bar.detail}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

export function FunnelChart({ title, steps }: { title: string; steps: { label: string; value: number; share: string }[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    const node = host.current;
    if (!node || !steps.length) return;
    let dead = false;
    let chart: { dispose: () => void; resize: () => void } | null = null;
    const fonts = fontOf(node);
    const color = palette(node);
    void import("echarts").then((echarts) => {
      if (dead) return;
      const created = echarts.init(node, undefined, { renderer: "svg" });
      chart = created;
      created.setOption({
        animationDuration: 0,
        aria: { enabled: true },
        series: [{
          type: "funnel",
          left: 0,
          top: 8,
          bottom: 8,
          width: "92%",
          minSize: "12%",
          maxSize: "100%",
          sort: "none",
          gap: 6,
          label: {
            show: true,
            position: "inside",
            color: color.ink,
            fontFamily: fonts.sans,
            fontSize: 13,
            formatter: (item: { name: string; value: number; dataIndex: number }) => {
              const share = steps[item.dataIndex]?.share;
              return share ? `${item.name}  ${item.value.toLocaleString("en-US")}  ${share}` : `${item.name}  ${item.value.toLocaleString("en-US")}`;
            },
          },
          itemStyle: { borderWidth: 0 },
          data: steps.map((step, index) => ({
            name: step.label,
            value: step.value,
            itemStyle: { color: index === 0 ? color.orange : index === 1 ? color.funnel1 : index === 2 ? color.funnel2 : color.deep },
          })),
        }],
      });
      const observer = new ResizeObserver(() => created.resize());
      observer.observe(node);
    });
    return () => {
      dead = true;
      chart?.dispose();
    };
  }, [steps]);
  return (
    <section className="jr-panel">
      <div className="jr-ph"><h2>{title}</h2><span className="jr-lbl">{title === "Funnel" ? "all channels" : ""}</span></div>
      <div
        ref={host}
        style={{ height: 220 }}
        tabIndex={0}
        role="img"
        aria-label={steps.map((step) => `${step.label} ${step.value.toLocaleString("en-US")} ${step.share}`).join(", ")}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowRight") setFocus((index) => Math.min(steps.length - 1, index + 1));
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") setFocus((index) => Math.max(0, index - 1));
        }}
      />
      <p className="jr-attr" aria-live="polite">{steps[focus] ? `${steps[focus].label} ${steps[focus].value.toLocaleString("en-US")} ${steps[focus].share}` : ""}</p>
      <button type="button" className="jr-lbl" onClick={() => setTable((open) => !open)}>{table ? "Hide table" : "View as table"}</button>
      {table && (
        <table className="jr-table">
          <thead><tr><th>Step</th><th>Count</th><th>Share</th></tr></thead>
          <tbody>{steps.map((step) => <tr key={step.label}><td>{step.label}</td><td>{step.value.toLocaleString("en-US")}</td><td>{step.share}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

export function CohortChart({ columns, rows, note }: { columns: string[]; rows: { label: string; values: (number | null)[] }[]; note: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);
  const [cell, setCell] = useState("Sep 28, week 0, 18%");
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let dead = false;
    let chart: { dispose: () => void; resize: () => void } | null = null;
    const fonts = fontOf(node);
    const color = palette(node);
    const data: [number, number, number][] = [];
    rows.forEach((row, y) => {
      row.values.forEach((value, x) => {
        if (value != null) data.push([x, y, value]);
      });
    });
    void import("echarts").then((echarts) => {
      if (dead) return;
      const created = echarts.init(node, undefined, { renderer: "svg" });
      chart = created;
      created.setOption({
        animationDuration: 0,
        aria: { enabled: true, decal: { show: true } },
        tooltip: {
          backgroundColor: color.tip,
          borderColor: color.tipLine,
          textStyle: { color: color.text },
          transitionDuration: REPORT_MOTION.tooltipInMs / 1000,
          formatter: (item: { data: [number, number, number] }) => {
            const [x, y, value] = item.data;
            return `${rows[y]?.label} · ${columns[x]} · ${value}% booked`;
          },
        },
        grid: { left: 64, right: 12, top: 12, bottom: 28 },
        xAxis: { type: "category", data: columns, axisLabel: { color: color.muted, fontFamily: fonts.mono, fontSize: 11 }, axisLine: { lineStyle: { color: color.line } } },
        yAxis: { type: "category", data: rows.map((row) => row.label), axisLabel: { color: color.muted, fontFamily: fonts.mono, fontSize: 11 }, axisLine: { show: false } },
        visualMap: { min: 18, max: 44, show: false, inRange: { color: color.heat } },
        series: [{
          type: "heatmap",
          data,
          label: {
            show: true,
            formatter: (item: { data: [number, number, number] }) => `${item.data[2]}%`,
            fontFamily: fonts.mono,
            fontSize: 11,
            color: color.ink,
          },
          itemStyle: { borderRadius: 4, borderColor: color.tip, borderWidth: 3 },
        }],
      });
      const observer = new ResizeObserver(() => created.resize());
      observer.observe(node);
    });
    return () => {
      dead = true;
      chart?.dispose();
    };
  }, [columns, rows]);
  return (
    <section className="jr-panel">
      <div className="jr-ph"><h2>Booked by lead week</h2><span className="jr-lbl">cohort</span></div>
      <div
        ref={host}
        style={{ height: 240 }}
        tabIndex={0}
        role="img"
        aria-label={`Lead to booked cohort. ${note}`}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const flat = rows.flatMap((row) => row.values.map((value, index) => (value == null ? null : `${row.label}, ${columns[index]}, ${value}%`))).filter(Boolean) as string[];
          setCell((current) => {
            const index = flat.indexOf(current);
            const next = event.key === "ArrowRight" ? Math.min(flat.length - 1, index + 1) : Math.max(0, index - 1);
            return flat[next] || current;
          });
        }}
      />
      <p className="jr-attr" aria-live="polite">{cell}</p>
      <p className="jr-attr">{note}</p>
      <button type="button" className="jr-lbl" onClick={() => setTable((open) => !open)}>{table ? "Hide table" : "View as table"}</button>
      {table && (
        <table className="jr-table">
          <caption className="jr-sr">Booked percent by lead week</caption>
          <thead><tr><th>Lead week</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                {row.values.map((value, index) => <td key={columns[index]}>{value == null ? "" : `${value}%`}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}


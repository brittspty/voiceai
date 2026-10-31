import Image from "next/image";
import { REPORT_LOGO_ALT, REPORT_LOGO_FULL } from "@/lib/marketing/reports/brand";
import { formatKpi } from "@/lib/marketing/reports/format";
import type { ClientReport, ReportDocument, StaffReport } from "@/lib/marketing/reports/types";

function spark(values: number[]) {
  if (values.length < 2) return "";
  const width = 700;
  const height = 160;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 16 - ((value - min) / span) * (height - 32);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function PrintReport({ report }: { report: ReportDocument }) {
  const staff = report.audience === "staff" ? (report as StaffReport) : null;
  const client = report.audience === "client" ? (report as ClientReport) : null;
  const series = report.series.find((item) => item.id === report.defaultSeriesId) ?? report.series[0];
  const prior = series?.points.map((point) => point.prior) ?? [];
  const current = series?.points.map((point) => point.value) ?? [];
  return (
    <div className="jr-sheets">
      <article className="jr-page">
        <Image src={REPORT_LOGO_FULL} alt={REPORT_LOGO_ALT} width={180} height={40} priority />
        {report.exampleData && <span className="jr-ex" style={{ position: "absolute", top: 56, right: 56 }}>EXAMPLE DATA</span>}
        <div className="jr-rule" />
        <div className="meta">{report.pdf.kicker}</div>
        <h1>{report.clientName}</h1>
        <p className="lead">{report.pdf.coverSentence}</p>
        <p className="prep">Prepared by {report.pdf.preparer}</p>
        <footer className="jr-pf">
          <span>{report.footer}</span>
          <span>{report.exampleData ? "Confidential · EXAMPLE DATA" : "Confidential"}</span>
        </footer>
      </article>
      <article className="jr-page">
        <div className="meta">{report.pdf.resultsKicker}</div>
        <h1 style={{ fontSize: 24 }}>{report.pdf.resultsTitle}</h1>
        <div className="jr-metrics">
          {report.kpis.slice(0, 4).map((kpi) => (
            <div key={kpi.id}>
              <div className="meta" style={{ marginTop: 0 }}>{kpi.label}</div>
              <strong>{formatKpi(kpi.value, kpi.format)}</strong>
              <em>{kpi.delta}</em>
            </div>
          ))}
        </div>
        <svg className="jr-svg-line" viewBox="0 0 700 180" role="img" aria-label={series?.title || "Trend"}>
          {series?.goal != null && <line className="jr-print-goal" x1="0" x2="700" y1="70" y2="70" strokeDasharray="5 5" />}
          <polyline className="jr-print-prior" strokeDasharray="3 4" points={spark(prior)} />
          <polyline className="jr-print-current" strokeWidth="2.5" points={spark(current)} />
          <text className="jr-swatch-goal" x="690" y="62" textAnchor="end" fontSize="11">GOAL</text>
        </svg>
        {report.pdf.annotation && <p className="jr-callout"><b>{report.pdf.annotation.split(":")[0]}:</b> {report.pdf.annotation.split(":").slice(1).join(":").trim() || report.pdf.annotation}</p>}
        <h2 style={{ fontSize: 16, margin: "26px 0 8px" }}>{report.channelHeading}</h2>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Leads</th>
              <th>Qualified</th>
              <th>Booked</th>
              {staff && <th>CPL</th>}
            </tr>
          </thead>
          <tbody>
            {(staff ? staff.channels : client?.channels ?? []).map((row) => (
              <tr key={row.id}>
                <td>{"staffName" in row ? row.staffName : row.name}</td>
                <td>{row.leads}</td>
                <td>{row.qualified}</td>
                <td>{row.booked}</td>
                {staff && "cpl" in row && <td>{row.cpl == null ? "n/a" : `$${row.cpl.toFixed(2)}`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <footer className="jr-pf">
          <span>{report.clientName} · {report.pdf.periodName} · Page 2 of 2</span>
          <span>{report.exampleData ? "EXAMPLE DATA" : ""}</span>
        </footer>
      </article>
    </div>
  );
}

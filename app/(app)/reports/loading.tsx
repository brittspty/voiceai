import { ReportFrame } from "@/components/reports/report-frame";

export default function ReportsLoading() {
  return (
    <ReportFrame>
    <div className="jr-wrap" aria-busy="true" aria-label="Loading report">
      <div className="jr-skel" style={{ width: 280, height: 28 }} />
      <div className="jr-skel" style={{ width: 180, height: 64, marginTop: 24 }} />
      <div className="jr-skel" style={{ height: 280, marginTop: 16 }} />
    </div>
    </ReportFrame>
  );
}

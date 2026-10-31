import "@/components/jarvis/jarvis.css";
import type { InsightView } from "@/lib/insights/live";

export function InsightsScreen({ view }: { view: InsightView }) {
  return (
    <main className="jarvis">
      <div className="top">
        <div>
          <div className="sub">Staff only · anonymized · recommendations only</div>
          <h1>Insights</h1>
        </div>
        {view.origin === "example" ? <span className="ex">EXAMPLE DATA</span> : <p role="status">{view.label}</p>}
      </div>
      <p>{view.note} These are recommendations only. Nothing here changes a campaign.</p>
      {view.items.length === 0 && <p>No comparison is available.</p>}
      {view.items.map((card) => (
        <article key={card.id} className="dec">
          <div className="tag">{card.vertical}</div>
          <h2>{card.recommendation}</h2>
          <p>{card.reason}</p>
          <p className="sub">{card.basedOn}</p>
        </article>
      ))}
    </main>
  );
}

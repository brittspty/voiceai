import "@/components/jarvis/jarvis.css";
import type { InsightCard } from "@/lib/insights/learn";

export function InsightsScreen({ cards }: { cards: InsightCard[] }) {
  return (
    <main className="jarvis">
      <div className="top">
        <div>
          <div className="sub">Staff only · anonymized · recommendations only</div>
          <h1>Insights</h1>
        </div>
        <span className="ex">EXAMPLE DATA</span>
      </div>
      <p>Patterns across clients, with the business names removed. These are recommendations only. Nothing here changes a campaign.</p>
      {cards.map((card) => (
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

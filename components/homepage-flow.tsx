import { HERO_DIAGRAM_INNER } from "@/components/homepage-diagram";

/** Visible claim. Leave this sentence exactly as written. */
export const HERO_FLOW_CLAIM = "jAI runs ads on virtually every ad platform available.";

export function HomepageFlow() {
  return (
    <figure className="hero-visual hero-flow">
      <svg className="hero-diag" viewBox="0 0 520 420" role="img" aria-labelledby="flow-title" dangerouslySetInnerHTML={{ __html: HERO_DIAGRAM_INNER }} />
      <p className="flow-claim">{HERO_FLOW_CLAIM}</p>
      <figcaption>ILLUSTRATIVE · one sample list, prepared for every channel. Not a live upload.</figcaption>
    </figure>
  );
}

/** Static sample of one data-market list prepared across channels. No live data. */
const CHANNELS = [
  "Every Social platform",
  "Display/programmatic",
  "Google ads",
  "CTV",
  "Email",
  "Text",
  "Voice agent",
] as const;

const PILL_H = 36;
const PILL_GAP = 18;
const TOP = 18;
const PILL_X = 196;
const PILL_W = 266;

export function HomepageFlow() {
  return (
    <figure className="hero-flow">
      <svg viewBox="0 0 480 420" role="img" aria-label="Illustrative diagram. One data-market list prepared for every channel.">
        <rect className="flow-frame" x="16" y="36" width="132" height="348" rx="18" />
        <text className="flow-kicker" x="82" y="68" textAnchor="middle" fontSize="16">
          One list
        </text>
        {[0, 1, 2, 3, 4].map((row) => (
          <rect key={row} className={row === 2 ? "flow-bar flow-bar-on" : "flow-bar"} x="40" y={92 + row * 52} width="84" height="8" rx="4" />
        ))}
        {CHANNELS.map((name, index) => {
          const y = TOP + index * (PILL_H + PILL_GAP);
          const endY = y + PILL_H / 2;
          const startY = 78 + index * 42;
          return (
            <g key={name}>
              <path className="flow-line" d={`M148 ${startY} C 172 ${startY}, 176 ${endY}, ${PILL_X} ${endY}`} />
              <rect className="flow-pill" x={PILL_X} y={y} width={PILL_W} height={PILL_H} rx="18" />
              <text className="flow-name" x={PILL_X + PILL_W / 2} y={y + 24} textAnchor="middle" fontSize="15">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="flow-claim">jAI runs ads on virtually every ad platform available.</p>
      <figcaption>ILLUSTRATIVE · one sample list, prepared for every channel. Not a live upload.</figcaption>
    </figure>
  );
}

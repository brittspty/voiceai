/** Static sample of one data-market list prepared for four channels. No live data. */
const CHANNELS = ["Meta", "Google", "TikTok", "StackAdapt"] as const;

export function HomepageFlow() {
  return (
    <figure className="hero-flow">
      <svg viewBox="0 0 520 440" role="img" aria-label="Illustrative diagram. One data-market list prepared for Meta, Google, TikTok, and StackAdapt.">
        <rect className="flow-frame" x="24" y="36" width="150" height="368" rx="18" />
        <text className="flow-kicker" x="99" y="72" textAnchor="middle">
          One list
        </text>
        {[0, 1, 2, 3, 4].map((row) => (
          <rect key={row} className={row === 2 ? "flow-bar flow-bar-on" : "flow-bar"} x="48" y={96 + row * 52} width="102" height="10" rx="5" />
        ))}
        {CHANNELS.map((name, index) => {
          const y = 78 + index * 86;
          return (
            <g key={name}>
              <path className={index === 0 ? "flow-line flow-line-on" : "flow-line"} d={`M174 ${118 + index * 56} C 260 ${118 + index * 56}, 290 ${y + 22}, 330 ${y + 22}`} />
              <rect className={index === 0 ? "flow-pill flow-pill-on" : "flow-pill"} x="330" y={y} width="162" height="44" rx="22" />
              <text className="flow-name" x="411" y={y + 28} textAnchor="middle">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>ILLUSTRATIVE · one sample list, prepared for four channels. Not a live upload.</figcaption>
    </figure>
  );
}

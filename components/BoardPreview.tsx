import { CONTINENTS, TERRITORIES } from "@/lib/game-data";
import { SEA_ROUTE_PATHS, TERRITORY_SHAPES } from "@/lib/territory-shapes";

export default function BoardPreview() {
  return (
    <section className="landing-board-preview" aria-hidden="true">
      <div className="landing-board-copy"><span>PLANCIA INTERATTIVA</span><b>42 territori. Ogni confine conta.</b></div>
      <svg viewBox="0 0 1100 620">
        <defs>
          <radialGradient id="previewOcean"><stop stopColor="#254445" /><stop offset="1" stopColor="#0a1c1d" /></radialGradient>
          <filter id="previewGlow"><feGaussianBlur stdDeviation="7" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width="1100" height="620" rx="26" fill="url(#previewOcean)" />
        <g className="preview-sea-routes">{SEA_ROUTE_PATHS.map((path) => <path key={path} d={path} />)}</g>
        {TERRITORIES.map((territory, index) => (
          <path
            key={territory.id}
            d={TERRITORY_SHAPES[territory.id]}
            fill={CONTINENTS[territory.continent].color}
            opacity={.62 + (index % 4) * .08}
          />
        ))}
        <path className="preview-campaign" d="M74 106 C260 53 405 170 520 342 S760 414 865 351 S980 400 1007 539" filter="url(#previewGlow)" />
        {[{ x: 74, y: 106 }, { x: 520, y: 342 }, { x: 865, y: 351 }, { x: 1007, y: 539 }].map((point, index) => <circle className="preview-pin" key={index} cx={point.x} cy={point.y} r="11" style={{ animationDelay: `${index * .3}s` }} />)}
      </svg>
    </section>
  );
}

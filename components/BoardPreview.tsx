import { BOARD_VIEW_BOX, TERRITORY_CENTERS } from "@/lib/territory-shapes";

export default function BoardPreview() {
  return (
    <section className="landing-board-preview" aria-hidden="true">
      <div className="landing-board-copy"><span>PLANCIA INTERATTIVA</span><b>42 territori. Ogni confine conta.</b></div>
      <svg viewBox={BOARD_VIEW_BOX}>
        <defs>
          <filter id="previewGlow"><feGaussianBlur stdDeviation="7" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <image href="/dominio-globale-board.svg" width="750" height="519" preserveAspectRatio="xMidYMid meet" />
        <path className="preview-campaign" d="M52.6 88.9 C184 35 262 129 355.1 292.7 S501 337 593.4 292.5 S631 393 689.7 445.1" filter="url(#previewGlow)" />
        {[
          TERRITORY_CENTERS.alaska,
          TERRITORY_CENTERS["north-africa"],
          TERRITORY_CENTERS.siam,
          TERRITORY_CENTERS["eastern-australia"],
        ].map((point, index) => <circle className="preview-pin" key={index} cx={point.x} cy={point.y} r="7" style={{ animationDelay: `${index * .3}s` }} />)}
      </svg>
    </section>
  );
}

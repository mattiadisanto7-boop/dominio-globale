"use client";

import { useId, type CSSProperties } from "react";
import { TERRITORIES } from "@/lib/game-data";
import {
  BOARD_TERRITORY_TRANSFORM,
  BOARD_VIEW_BOX,
  SEA_ROUTE_PATHS,
  TERRITORY_SHAPES,
} from "@/lib/territory-shapes";
import type { PublicGameState, PublicPlayer } from "@/lib/game-types";

export default function ObjectiveCard({ state, player, revealed = false }: { state: PublicGameState; player: PublicPlayer; revealed?: boolean }) {
  const patternToken = useId().replaceAll(":", "");
  const missingPatternId = `objectiveMissing-${player.id}-${patternToken}`;
  const securedPatternId = `objectiveSecured-${player.id}-${patternToken}`;
  const objective = player.objective;
  const required = new Set(objective?.territoryIds ?? []);
  const secured = objective?.territoryIds.filter((id) => state.territories[id].ownerId === player.id) ?? [];
  const securedPoints = secured.reduce((sum, id) => sum + TERRITORIES.find((territory) => territory.id === id)!.value, 0);
  const percent = objective ? Math.round((securedPoints / objective.points) * 100) : 0;

  return (
    <article className="objective-card challenge-card" style={{ "--player-color": player.color } as CSSProperties}>
      <div className="objective-heading">
        <span>CARTA OBIETTIVO · {revealed ? `RIVELATA · ${player.name}` : "SOLO TUA"}</span>
        <small>{objective ? `N° ${objective.number} / 16` : "IN PREPARAZIONE"}</small>
      </div>
      <div className="objective-map-wrap">
        <svg className="objective-map" viewBox={BOARD_VIEW_BOX} aria-label={objective ? `Mappa dell'obiettivo ${objective.number}` : "Obiettivo non ancora assegnato"}>
          <defs>
            <pattern id={missingPatternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <rect width="8" height="8" fill="#ffffff" />
              <rect width="8" height="8" fill={player.color} fillOpacity=".2" />
              <rect width="2.4" height="8" fill={player.color} fillOpacity=".24" />
            </pattern>
            <pattern id={securedPatternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <rect width="8" height="8" fill={player.color} />
              <rect width="2.4" height="8" fill="#ffffff" fillOpacity=".22" />
            </pattern>
          </defs>
          <rect width="750" height="519" rx="18" />
          <g className="objective-routes" aria-hidden="true">
            {SEA_ROUTE_PATHS.map((path) => <path key={path} d={path} />)}
          </g>
          <g transform={BOARD_TERRITORY_TRANSFORM}>
            {TERRITORIES.map((territory) => {
              const needed = required.has(territory.id);
              const owned = needed && state.territories[territory.id].ownerId === player.id;
              return <path key={territory.id} d={TERRITORY_SHAPES[territory.id]} className={needed ? owned ? "secured" : "required" : "outside"} style={needed ? { fill: `url(#${owned ? securedPatternId : missingPatternId})` } : undefined} />;
            })}
          </g>
        </svg>
        {objective && <span className="objective-number">{objective.number}</span>}
      </div>
      <div className="objective-status-ribbon">
        <span className="secured"><b>{secured.length}</b> GIÀ TUOI</span>
        <span className="missing"><b>{Math.max(0, (objective?.territoryIds.length ?? 0) - secured.length)}</b> DA CONQUISTARE</span>
      </div>
      <div className="objective-copy">
        <div><h3>{objective?.title ?? "Missione in preparazione"}</h3><b>{securedPoints}<small>/86</small></b></div>
        <p>{objective?.description ?? "La carta verrà assegnata all'inizio della partita."}</p>
      </div>
      <div className="objective-progress" aria-label={`Obiettivo completato al ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="objective-legend"><span><i className="missing" /> Tinta chiara = da conquistare</span><span><i className="secured" /> Colore pieno = già tuo</span><b>{secured.length}/{objective?.territoryIds.length ?? 0} territori</b></div>
      <dl className="player-stats">
        <div><dt>{player.stats.attacks}</dt><dd>attacchi</dd></div>
        <div><dt>{player.stats.territoriesConquered}</dt><dd>conquiste</dd></div>
        <div><dt>{player.stats.armiesDefeated}</dt><dd>armate eliminate</dd></div>
      </dl>
    </article>
  );
}

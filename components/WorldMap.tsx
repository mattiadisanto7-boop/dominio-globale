"use client";

import { useMemo, type CSSProperties } from "react";
import {
  CONTINENTS,
  TERRITORIES,
  TERRITORY_BY_ID,
  type ContinentId,
  type TerritoryId,
} from "@/lib/game-data";
import { SEA_ROUTE_PATHS, TERRITORY_SHAPES } from "@/lib/territory-shapes";
import type { PublicGameState } from "@/lib/game-types";

type MapStyle = CSSProperties & {
  "--land-color": string;
  "--owner-color": string;
};

const OCEAN_LABELS = [
  { x: 385, y: 350, lines: ["OCEANO", "ATLANTICO"] },
  { x: 1061, y: 310, lines: ["OCEANO", "PACIFICO"] },
  { x: 775, y: 525, lines: ["OCEANO", "INDIANO"] },
];

export default function WorldMap({
  state,
  meId,
  selectedFrom,
  selectedTo,
  onTerritory,
}: {
  state: PublicGameState;
  meId: string;
  selectedFrom?: TerritoryId;
  selectedTo?: TerritoryId;
  onTerritory: (id: TerritoryId) => void;
}) {
  const playerColor = useMemo(
    () => Object.fromEntries(state.players.map((player) => [player.id, player.color])),
    [state.players],
  );
  const playerName = useMemo(
    () => Object.fromEntries(state.players.map((player) => [player.id, player.name])),
    [state.players],
  );
  const validTargets = selectedFrom
    ? new Set<TerritoryId>(TERRITORY_BY_ID[selectedFrom].adjacent)
    : new Set<TerritoryId>();

  return (
    <div className="map-scroll board-frame">
      <div className="board-corner corner-one" /><div className="board-corner corner-two" />
      <div className="board-corner corner-three" /><div className="board-corner corner-four" />
      <svg className="world-map" viewBox="0 0 1100 620" role="group" aria-label="Tabellone mondiale con 42 territori">
        <defs>
          <filter id="territoryGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="tokenShadow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity=".72" />
          </filter>
          <pattern id="boardGrain" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M0 15 C18 8 30 20 48 13 S71 7 80 15 M0 58 C19 50 37 63 55 55 S72 49 80 58" fill="none" stroke="rgba(255,255,255,.025)" strokeWidth="1" />
            <circle cx="11" cy="35" r=".8" fill="rgba(255,255,255,.06)" /><circle cx="63" cy="33" r=".6" fill="rgba(255,255,255,.045)" />
          </pattern>
          <marker id="attackArrow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L0 6 L7 3 Z" fill="#ffe5a5" />
          </marker>
          <radialGradient id="oceanLight" cx="50%" cy="35%" r="80%">
            <stop offset="0" stopColor="#294b4b" /><stop offset=".62" stopColor="#132f31" /><stop offset="1" stopColor="#07191b" />
          </radialGradient>
        </defs>

        <rect x="5" y="5" width="1090" height="610" rx="18" fill="url(#oceanLight)" stroke="rgba(225,203,145,.3)" strokeWidth="2" />
        <rect x="11" y="11" width="1078" height="598" rx="14" fill="url(#boardGrain)" stroke="rgba(255,255,255,.06)" />

        <g className="ocean-labels" aria-hidden="true">
          {OCEAN_LABELS.map((label) => (
            <text key={label.x} x={label.x} y={label.y} textAnchor="middle">
              {label.lines.map((line, index) => <tspan key={line} x={label.x} dy={index ? 17 : 0}>{line}</tspan>)}
            </text>
          ))}
        </g>

        <g className="sea-routes" aria-hidden="true">
          {SEA_ROUTE_PATHS.map((path) => <path key={path} d={path} />)}
        </g>

        <g className="territory-layer">
          {TERRITORIES.map((territory, index) => {
            const current = state.territories[territory.id];
            const ownerColor = current.ownerId === "neutral"
              ? "#c8c2ad"
              : playerColor[current.ownerId] ?? "#c8c2ad";
            const selected = selectedFrom === territory.id || selectedTo === territory.id;
            const valid = validTargets.has(territory.id);
            const owner = current.ownerId === "neutral" ? "Impero neutrale" : playerName[current.ownerId];
            const style = {
              "--land-color": CONTINENTS[territory.continent].color,
              "--owner-color": ownerColor,
            } as MapStyle;
            return (
              <g
                key={territory.id}
                className={`territory-shape territory-tone-${index % 4} ${selected ? "selected" : ""} ${valid ? "valid-target" : ""} ${current.ownerId === meId ? "mine" : ""}`}
                style={style}
                onClick={() => onTerritory(territory.id)}
                role="button"
                tabIndex={0}
                aria-label={`${territory.name}, valore ${territory.value}, ${current.armies} armate, ${owner}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onTerritory(territory.id);
                }}
              >
                <title>{territory.name} · valore {territory.value} · {current.armies} armate · {owner}</title>
                <path className="land-shape" d={TERRITORY_SHAPES[territory.id]} />
                <circle className="territory-hit" cx={territory.x} cy={territory.y} r="29" />
                <g className="army-token" transform={`translate(${territory.x} ${territory.y})`} filter="url(#tokenShadow)">
                  <circle className="token-ring" r="16" />
                  <circle className="token-core" r="12.5" />
                  <text className="army-count" textAnchor="middle" y="4.5">{current.armies}</text>
                </g>
                <g className="territory-caption" transform={`translate(${territory.x} ${territory.y + 27})`}>
                  <rect x="-24" y="-9" width="48" height="17" rx="5" />
                  <text textAnchor="middle" y="3">{territory.short} <tspan>· {territory.value}</tspan></text>
                </g>
              </g>
            );
          })}
        </g>

        {selectedFrom && selectedTo && (
          <line
            className="selected-route"
            x1={TERRITORY_BY_ID[selectedFrom].x}
            y1={TERRITORY_BY_ID[selectedFrom].y}
            x2={TERRITORY_BY_ID[selectedTo].x}
            y2={TERRITORY_BY_ID[selectedTo].y}
            markerEnd="url(#attackArrow)"
          />
        )}

        <g className="compass" transform="translate(1030 520)" aria-hidden="true">
          <circle r="31" /><circle r="22" /><path d="M0-26 L7-6 L0 0 L-7-6 Z M0 26 L7 6 L0 0 L-7 6 Z M-26 0 L-6-7 L0 0 L-6 7 Z M26 0 L6-7 L0 0 L6 7 Z" />
          <text y="-36" textAnchor="middle">N</text>
        </g>

        <g className="board-title" transform="translate(355 562)" aria-hidden="true">
          <text className="board-title-main">DOMINIO GLOBALE</text>
          <text className="board-title-sub" y="22">CHALLENGE · 16 OBIETTIVI · 86 PUNTI</text>
        </g>
        <g className="board-score-key" transform="translate(42 585)" aria-hidden="true">
          {(Object.keys(CONTINENTS) as ContinentId[]).map((continent, index) => (
            <g key={continent} transform={`translate(${index * 126} 0)`}>
              <circle r="4" fill={CONTINENTS[continent].color} />
              <text x="9" y="3">{CONTINENTS[continent].name.toUpperCase()} +{CONTINENTS[continent].bonus}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

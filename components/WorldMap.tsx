"use client";

import { useMemo, type CSSProperties } from "react";
import { TERRITORIES, TERRITORY_BY_ID, type TerritoryId } from "@/lib/game-data";
import {
  BOARD_TERRITORY_TRANSFORM,
  BOARD_VIEW_BOX,
  TERRITORY_CENTERS,
  TERRITORY_SHAPES,
} from "@/lib/territory-shapes";
import type { PublicGameState } from "@/lib/game-types";

type MapStyle = CSSProperties & { "--owner-color": string };

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
  const me = state.players.find((player) => player.id === meId);
  const objectiveIds = me?.objective?.territoryIds ?? [];
  const objectiveTargets = new Set<TerritoryId>(objectiveIds);
  const objectiveSecured = new Set<TerritoryId>(
    objectiveIds.filter((id) => state.territories[id].ownerId === meId),
  );
  const validTargets = selectedFrom
    ? new Set<TerritoryId>(TERRITORY_BY_ID[selectedFrom].adjacent)
    : new Set<TerritoryId>();

  return (
    <div className="map-scroll board-frame">
      <div className="board-corner corner-one" /><div className="board-corner corner-two" />
      <div className="board-corner corner-three" /><div className="board-corner corner-four" />
      {me?.objective && (
        <div className="map-objective-key" aria-label={`Obiettivo ${me.objective.number}: ${objectiveSecured.size} territori conquistati su ${objectiveIds.length}`}>
          <b>OBIETTIVO {me.objective.number}</b>
          <span><i className="mission-missing" /> da conquistare</span>
          <span><i className="mission-secured" /> già tuo</span>
          <strong>{objectiveSecured.size}/{objectiveIds.length}</strong>
        </div>
      )}
      <svg className="world-map" viewBox={BOARD_VIEW_BOX} role="group" aria-label="Tabellone mondiale realistico con 42 territori">
        <defs>
          <filter id="tokenShadow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#000" floodOpacity=".82" />
          </filter>
          <filter id="missionGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="missionMissingPattern" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="7" height="7" fill="#d71934" fillOpacity=".34" />
            <rect width="2" height="7" fill="#ff9aa2" fillOpacity=".42" />
          </pattern>
          <pattern id="missionSecuredPattern" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <rect width="7" height="7" fill="#10a967" fillOpacity=".3" />
            <rect width="2" height="7" fill="#9cffcf" fillOpacity=".4" />
          </pattern>
          <marker id="attackArrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L0 6 L6 3 Z" fill="#ffe5a5" />
          </marker>
        </defs>

        <image href="/dominio-globale-board.svg" x="0" y="0" width="750" height="519" preserveAspectRatio="xMidYMid meet" />

        <g className="territory-interaction-layer">
          {TERRITORIES.map((territory) => {
            const current = state.territories[territory.id];
            const center = TERRITORY_CENTERS[territory.id];
            const ownerColor = current.ownerId === "neutral"
              ? "#d5cfbd"
              : playerColor[current.ownerId] ?? "#d5cfbd";
            const selected = selectedFrom === territory.id || selectedTo === territory.id;
            const valid = validTargets.has(territory.id);
            const mission = objectiveTargets.has(territory.id);
            const secured = objectiveSecured.has(territory.id);
            const owner = current.ownerId === "neutral" ? "Impero neutrale" : playerName[current.ownerId];
            const className = [
              "territory-shape",
              selected ? "selected" : "",
              valid ? "valid-target" : "",
              current.ownerId === meId ? "mine" : "",
              mission ? (secured ? "mission-secured" : "mission-missing") : "",
            ].filter(Boolean).join(" ");

            return (
              <g
                key={territory.id}
                className={className}
                style={{ "--owner-color": ownerColor } as MapStyle}
                onClick={() => onTerritory(territory.id)}
                role="button"
                tabIndex={0}
                aria-label={`${territory.name}, valore ${territory.value}, ${current.armies} armate, ${owner}${mission ? secured ? ", territorio obiettivo conquistato" : ", territorio obiettivo da conquistare" : ""}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onTerritory(territory.id);
                }}
              >
                <title>{territory.name} · valore {territory.value} · {current.armies} armate · {owner}</title>
                <path className="land-shape" transform={BOARD_TERRITORY_TRANSFORM} d={TERRITORY_SHAPES[territory.id]} />
                <circle className="territory-hit" cx={center.x} cy={center.y} r="13" />
              </g>
            );
          })}
        </g>

        {selectedFrom && selectedTo && (
          <line
            className="selected-route"
            x1={TERRITORY_CENTERS[selectedFrom].x}
            y1={TERRITORY_CENTERS[selectedFrom].y}
            x2={TERRITORY_CENTERS[selectedTo].x}
            y2={TERRITORY_CENTERS[selectedTo].y}
            markerEnd="url(#attackArrow)"
          />
        )}

        <g className="army-token-layer" pointerEvents="none">
          {TERRITORIES.map((territory) => {
            const current = state.territories[territory.id];
            const center = TERRITORY_CENTERS[territory.id];
            const ownerColor = current.ownerId === "neutral"
              ? "#d5cfbd"
              : playerColor[current.ownerId] ?? "#d5cfbd";
            const mission = objectiveTargets.has(territory.id);
            const secured = objectiveSecured.has(territory.id);
            return (
              <g key={territory.id} style={{ "--owner-color": ownerColor } as MapStyle}>
                <g className="army-token" transform={`translate(${center.x} ${center.y - 5.5})`} filter="url(#tokenShadow)">
                  <g className="tank-piece" transform="translate(3 0) rotate(-10)">
                    <rect className="tank-track" x="-7.5" y="-4.8" width="15" height="9.6" rx="3.2" />
                    <path className="tank-treads" d="M-5.2-3.1H5.2M-5.8 0H5.8M-5.2 3.1H5.2" />
                    <rect className="tank-hull" x="-5.8" y="-3.4" width="11.6" height="6.8" rx="2" />
                    <circle className="tank-turret" cx="1" cy="0" r="3" />
                    <path className="tank-barrel" d="M3-1.1 10.5-5.1" />
                  </g>
                  <text className="army-count" textAnchor="middle" x="-8.5" y="3">{current.armies}</text>
                </g>
                <g className="territory-caption" transform={`translate(${center.x} ${center.y + 9})`}>
                  <rect x="-15" y="-4.5" width="30" height="9" rx="3" />
                  <text textAnchor="middle" y="2">{territory.short} <tspan>· {territory.value}</tspan></text>
                </g>
                {mission && (
                  <g className={`objective-pin ${secured ? "secured" : "missing"}`} transform={`translate(${center.x + 10.5} ${center.y - 13})`} filter="url(#missionGlow)">
                    <circle r="4.7" />
                    <text textAnchor="middle" y="2.1">{secured ? "✓" : "!"}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

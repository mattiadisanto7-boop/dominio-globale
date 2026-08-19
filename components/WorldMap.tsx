"use client";

import { useMemo } from "react";
import {
  CONTINENTS,
  INTERCONTINENTAL_ROUTES,
  TERRITORIES,
  TERRITORY_BY_ID,
  type ContinentId,
  type TerritoryId,
} from "@/lib/game-data";
import type { PublicGameState } from "@/lib/game-types";

const CONTINENT_PATHS: Record<ContinentId, string> = {
  "north-america": "M35 84 C86 35 220 27 331 60 C358 79 346 117 316 133 C337 170 306 210 284 239 C258 272 241 326 209 326 C178 318 180 277 143 258 C109 241 101 207 110 178 C72 167 45 138 35 84 Z",
  "south-america": "M239 339 C287 323 363 341 379 387 C390 422 348 456 330 495 C316 532 318 579 285 594 C259 570 264 531 240 493 C220 457 226 410 239 339 Z",
  europe: "M430 84 C462 63 505 79 532 82 C565 62 606 74 631 97 C667 108 687 142 676 177 C664 215 620 244 594 279 C559 297 523 287 493 267 C457 248 440 216 447 188 C419 164 417 118 430 84 Z",
  africa: "M472 298 C518 277 603 281 647 310 C683 342 686 408 666 455 C645 504 625 573 580 577 C536 567 529 510 503 474 C474 434 447 362 472 298 Z",
  asia: "M641 84 C709 40 842 27 943 48 C1020 47 1067 86 1058 135 C1071 182 1045 239 1001 257 C966 280 926 290 904 331 C884 367 833 377 802 349 C777 320 732 310 699 280 C670 251 651 215 658 181 C626 152 625 112 641 84 Z",
  oceania: "M842 399 C877 376 925 398 946 412 C984 389 1047 405 1065 447 C1078 483 1046 511 1041 553 C1029 588 976 590 945 570 C909 595 858 567 851 531 C826 504 823 439 842 399 Z",
};

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
  const playerColor = useMemo(() => Object.fromEntries(state.players.map((player) => [player.id, player.color])), [state.players]);
  const playerName = useMemo(() => Object.fromEntries(state.players.map((player) => [player.id, player.name])), [state.players]);
  const validTargets = selectedFrom ? new Set(TERRITORY_BY_ID[selectedFrom].adjacent) : new Set<TerritoryId>();
  const edges = useMemo(() => {
    const seas = new Set(INTERCONTINENTAL_ROUTES.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`]));
    return TERRITORIES.flatMap((territory) => territory.adjacent
      .filter((neighbor) => territory.id < neighbor && !seas.has(`${territory.id}:${neighbor}`))
      .map((neighbor) => [territory.id, neighbor] as [TerritoryId, TerritoryId]));
  }, []);

  return (
    <div className="map-scroll">
      <svg className="world-map" viewBox="0 0 1100 620" role="group" aria-label="Mappa dei 42 territori">
        <defs>
          <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <pattern id="oceanGrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="rgba(172,201,204,.06)" strokeWidth="1" /></pattern>
        </defs>
        <rect width="1100" height="620" rx="28" fill="#071718" /><rect width="1100" height="620" rx="28" fill="url(#oceanGrid)" />
        {(Object.keys(CONTINENTS) as ContinentId[]).map((continent) => {
          const territories = TERRITORIES.filter((territory) => territory.continent === continent);
          const center = territories.reduce((sum, territory) => sum + territory.x, 0) / territories.length;
          return (
            <g key={continent} className="continent-layer">
              <path d={CONTINENT_PATHS[continent]} fill={CONTINENTS[continent].color} />
              <text x={center} y={["south-america", "africa", "oceania"].includes(continent) ? 607 : 32}>{CONTINENTS[continent].name.toUpperCase()} · +{CONTINENTS[continent].bonus}</text>
            </g>
          );
        })}
        <g className="map-routes">
          {edges.map(([from, to]) => <line key={`${from}-${to}`} x1={TERRITORY_BY_ID[from].x} y1={TERRITORY_BY_ID[from].y} x2={TERRITORY_BY_ID[to].x} y2={TERRITORY_BY_ID[to].y} />)}
          {INTERCONTINENTAL_ROUTES.filter(([from, to]) => !(from === "alaska" && to === "kamchatka")).map(([from, to]) => <line className="sea-route" key={`${from}-${to}`} x1={TERRITORY_BY_ID[from].x} y1={TERRITORY_BY_ID[from].y} x2={TERRITORY_BY_ID[to].x} y2={TERRITORY_BY_ID[to].y} />)}
          <path className="sea-route" d="M74 106 C35 35 1060 24 1017 104" />
        </g>
        {TERRITORIES.map((territory) => {
          const current = state.territories[territory.id];
          const color = current.ownerId === "neutral" ? "#697374" : playerColor[current.ownerId] ?? "#697374";
          const selected = selectedFrom === territory.id || selectedTo === territory.id;
          const valid = validTargets.has(territory.id);
          return (
            <g
              key={territory.id}
              className={`territory-node ${selected ? "selected" : ""} ${valid ? "valid-target" : ""} ${current.ownerId === meId ? "mine" : ""}`}
              transform={`translate(${territory.x} ${territory.y})`}
              onClick={() => onTerritory(territory.id)}
              role="button"
              tabIndex={0}
              aria-label={`${territory.name}, ${current.armies} armate, ${current.ownerId === "neutral" ? "neutrale" : playerName[current.ownerId]}`}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onTerritory(territory.id); }}
            >
              <title>{territory.name} · {current.armies} armate · {current.ownerId === "neutral" ? "Impero neutrale" : playerName[current.ownerId]}</title>
              <circle className="node-pulse" r="26" fill={color} /><circle className="node-core" r="19" fill={color} />
              <text className="army-count" textAnchor="middle" y="6">{current.armies}</text><text className="territory-label" textAnchor="middle" y="38">{territory.short}</text>
            </g>
          );
        })}
        <g className="map-legend" transform="translate(26 575)"><circle cx="7" cy="7" r="6" fill="#697374" /><text x="19" y="11">NEUTRALE</text><path d="M97 7H130" className="sea-route" /><text x="140" y="11">ROTTA MARITTIMA</text></g>
      </svg>
    </div>
  );
}

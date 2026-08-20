"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CONTINENTS, SYMBOL_LABELS, TERRITORY_BY_ID } from "@/lib/game-data";
import {
  BOARD_TERRITORY_TRANSFORM,
  TERRITORY_CENTERS,
  TERRITORY_SHAPES,
} from "@/lib/territory-shapes";
import type { PublicPlayer, TerritoryCard } from "@/lib/game-types";

const SYMBOLS = {
  fanteria: "♟",
  cavalleria: "♞",
  artiglieria: "✹",
  jolly: "★",
} as const;

export default function DrawnCardReveal({ player }: { player: PublicPlayer }) {
  const initialDraw = useRef(player.lastDrawnAt);
  const [card, setCard] = useState<TerritoryCard>();

  useEffect(() => {
    if (!player.lastDrawnAt || player.lastDrawnAt === initialDraw.current || !player.lastDrawnCard) return;
    initialDraw.current = player.lastDrawnAt;
    setCard(player.lastDrawnCard);
    const close = window.setTimeout(() => setCard(undefined), 3000);
    return () => window.clearTimeout(close);
  }, [player.lastDrawnAt, player.lastDrawnCard]);

  if (!card) return null;
  const territory = card.territoryId ? TERRITORY_BY_ID[card.territoryId] : undefined;
  const center = card.territoryId ? TERRITORY_CENTERS[card.territoryId] : undefined;
  const continent = territory ? CONTINENTS[territory.continent] : undefined;

  return (
    <div className="draw-card-toast" role="status" aria-live="assertive">
      <div className="draw-card-backdrop-pulse" />
      <section
        className={`draw-card-face ${card.symbol}`}
        style={{ "--draw-card-color": continent?.color ?? "#d9ba73" } as CSSProperties}
      >
        <span className="draw-card-kicker">CARTA PESCATA · SOLO PER TE</span>
        <span className={`draw-card-unit ${card.symbol}`}><b>{SYMBOLS[card.symbol]}</b><small>{SYMBOL_LABELS[card.symbol]}</small></span>
        {territory && center ? (
          <svg className="draw-card-shape" viewBox={`${center.x - 62} ${center.y - 48} 124 96`} aria-hidden="true">
            <path transform={BOARD_TERRITORY_TRANSFORM} d={TERRITORY_SHAPES[territory.id]} />
          </svg>
        ) : (
          <div className="draw-card-jolly" aria-hidden="true">★</div>
        )}
        <small>{continent?.name ?? "Carta universale"}</small>
        <h2>{territory?.name ?? "Jolly universale"}</h2>
        <p>{territory ? `${SYMBOL_LABELS[card.symbol]} · carta territorio` : "Può completare una coppia di simboli uguali"}</p>
        <i className="draw-card-timer" />
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CONTINENTS, SYMBOL_LABELS, TERRITORY_BY_ID } from "@/lib/game-data";
import type { PublicPlayer } from "@/lib/game-types";

const SYMBOLS = {
  fanteria: "▲",
  cavalleria: "◆",
  artiglieria: "●",
  jolly: "★",
} as const;

export default function DrawnCardPanel({ player }: { player: PublicPlayer }) {
  const card = player.lastDrawnCard;
  const [open, setOpen] = useState(Boolean(card));
  const previousId = useRef(card?.id);

  useEffect(() => {
    if (card?.id && card.id !== previousId.current) setOpen(true);
    previousId.current = card?.id;
  }, [card?.id]);

  if (!card) return null;
  const territory = card.territoryId ? TERRITORY_BY_ID[card.territoryId] : undefined;
  const title = territory?.name ?? "Jolly universale";

  return (
    <section className={`drawn-card-panel ${open ? "expanded" : "collapsed"}`} aria-label="La tua ultima carta pescata">
      <button className="drawn-card-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`drawn-card-mini ${card.symbol}`}>{SYMBOLS[card.symbol]}</span>
        <span><small>ULTIMA CARTA PESCATA</small><b>{title}</b></span>
        <em>{open ? "NASCONDI" : "VEDI"}</em>
      </button>
      {open && (
        <div className="drawn-card-reveal">
          <div className="drawn-card-art">
            <i className="card-grid" />
            <span className={`drawn-card-symbol ${card.symbol}`}>{SYMBOLS[card.symbol]}</span>
            <small>CARTA TERRITORIO</small>
            <h3>{title}</h3>
            <p>{SYMBOL_LABELS[card.symbol]}{territory ? ` · ${CONTINENTS[territory.continent].name}` : " · vale come simbolo universale"}</p>
          </div>
          <div className="private-card-note"><span>◆</span><p><b>Informazione riservata</b><small>Questa carta è visibile soltanto a te, anche durante il turno degli avversari.</small></p></div>
        </div>
      )}
    </section>
  );
}

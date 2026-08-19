"use client";

import { useEffect, useState } from "react";
import { CONTINENTS, SYMBOL_LABELS, TERRITORY_BY_ID } from "@/lib/game-data";
import { gameSound } from "@/lib/sound-engine";
import type { PublicGameState, PublicPlayer } from "@/lib/game-types";

const SYMBOLS = {
  fanteria: "▲",
  cavalleria: "◆",
  artiglieria: "●",
  jolly: "★",
} as const;

export default function CardsVault({ state, player }: { state: PublicGameState; player: PublicPlayer }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const toggle = () => {
    gameSound.play("cards");
    setOpen((value) => !value);
  };

  return (
    <>
      <button className="cards-vault-trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <span className="cards-stack" aria-hidden="true"><i /><i /><b>◆</b></span>
        <span><small>ARSENALE RISERVATO</small><strong>Le tue carte</strong></span>
        <em>{player.cardCount}</em>
      </button>
      {open && (
        <div className="modal-backdrop cards-vault-backdrop" role="dialog" aria-modal="true" aria-label="Tutte le tue carte territorio" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="cards-vault-modal">
            <header>
              <div><span className="eyebrow"><i /> SOLO PER TE</span><h2>Il tuo mazzo</h2><p>Resta consultabile anche durante il turno degli avversari.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Chiudi le carte">×</button>
            </header>
            {player.cards.length ? (
              <div className="cards-vault-grid">
                {player.cards.map((card, index) => {
                  const territory = card.territoryId ? TERRITORY_BY_ID[card.territoryId] : undefined;
                  const owned = Boolean(card.territoryId && state.territories[card.territoryId].ownerId === player.id);
                  return (
                    <article className={`vault-card ${card.symbol} ${owned ? "owned" : ""}`} key={card.id}>
                      <span className="vault-card-index">{String(index + 1).padStart(2, "0")}</span>
                      <div className="vault-card-symbol">{SYMBOLS[card.symbol]}</div>
                      <small>{SYMBOL_LABELS[card.symbol]}</small>
                      <h3>{territory?.name ?? "Jolly universale"}</h3>
                      <p>{territory ? CONTINENTS[territory.continent].name : "Sostituisce qualsiasi simbolo"}</p>
                      {owned && <strong>+2 SE USATA NEL TRIS</strong>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="cards-vault-empty"><span>◇</span><h3>Nessuna carta</h3><p>Conquista almeno un territorio e termina il turno per pescarne una.</p></div>
            )}
            <footer><span>{player.cardCount} {player.cardCount === 1 ? "carta posseduta" : "carte possedute"}</span><small>Gli altri giocatori vedono soltanto il numero, mai il contenuto.</small></footer>
          </section>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cardTradeValue, mustTradeCards } from "@/lib/card-rules";
import { CONTINENTS, SYMBOL_LABELS, TERRITORY_BY_ID } from "@/lib/game-data";
import {
  BOARD_TERRITORY_TRANSFORM,
  TERRITORY_CENTERS,
  TERRITORY_SHAPES,
} from "@/lib/territory-shapes";
import { gameSound } from "@/lib/sound-engine";
import type { GameAction, PublicGameState, PublicPlayer, TerritoryCard } from "@/lib/game-types";

const SYMBOLS = {
  fanteria: "♟",
  cavalleria: "♞",
  artiglieria: "✹",
  jolly: "★",
} as const;

export default function CardsVault({
  state,
  player,
  action,
  busy,
}: {
  state: PublicGameState;
  player: PublicPlayer;
  action: (action: GameAction) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedCards = useMemo(
    () => selected.map((id) => player.cards.find((card) => card.id === id)).filter(Boolean) as TerritoryCard[],
    [player.cards, selected],
  );
  const value = cardTradeValue(selectedCards);
  const canTradeNow = state.currentPlayerId === player.id && (state.phase === "reinforce" || state.phase === "attack");
  const mandatory = mustTradeCards(player.cards);

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
    setOpen((current) => !current);
  };

  const toggleCard = (id: string) => {
    gameSound.play("ui");
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < 3 ? [...current, id] : current);
  };

  const playSet = async () => {
    if (!canTradeNow || value <= 0 || selected.length !== 3) return;
    await action({ type: "tradeCards", cardIds: selected });
    setSelected([]);
  };

  return (
    <>
      <button className={`cards-vault-trigger ${mandatory ? "mandatory" : ""}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <span className="cards-stack" aria-hidden="true"><i /><i /><b>◆</b></span>
        <span><small>{mandatory ? "TRIS DA GIOCARE" : "ARSENALE RISERVATO"}</small><strong>Le tue carte</strong></span>
        <em>{player.cardCount}</em>
      </button>
      {open && (
        <div className="modal-backdrop cards-vault-backdrop" role="dialog" aria-modal="true" aria-label="Tutte le tue carte territorio" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="cards-vault-modal">
            <header>
              <div><span className="eyebrow"><i /> SOLO PER TE</span><h2>Le tue carte</h2><p>Seleziona direttamente qui tre carte per giocare un tris valido.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Chiudi le carte">×</button>
            </header>
            {player.cards.length ? (
              <div className="cards-vault-grid">
                {player.cards.map((card, index) => {
                  const territory = card.territoryId ? TERRITORY_BY_ID[card.territoryId] : undefined;
                  const owned = Boolean(card.territoryId && state.territories[card.territoryId].ownerId === player.id);
                  const center = card.territoryId ? TERRITORY_CENTERS[card.territoryId] : undefined;
                  const isSelected = selected.includes(card.id);
                  return (
                    <button
                      type="button"
                      className={`vault-card ${card.symbol} ${owned ? "owned" : ""} ${isSelected ? "selected" : ""}`}
                      key={card.id}
                      onClick={() => toggleCard(card.id)}
                      aria-pressed={isSelected}
                      style={{ "--card-continent": territory ? CONTINENTS[territory.continent].color : "#d9ba73" } as CSSProperties}
                    >
                      <span className="vault-card-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="vault-selection-mark">{isSelected ? selected.indexOf(card.id) + 1 : ""}</span>
                      <span className={`vault-card-symbol ${card.symbol}`}><b>{SYMBOLS[card.symbol]}</b><small>{SYMBOL_LABELS[card.symbol]}</small></span>
                      {territory && center ? (
                        <span className="vault-territory-art" aria-hidden="true">
                          <svg viewBox={`${center.x - 58} ${center.y - 44} 116 88`} preserveAspectRatio="xMidYMid meet">
                            <path transform={BOARD_TERRITORY_TRANSFORM} d={TERRITORY_SHAPES[territory.id]} />
                          </svg>
                        </span>
                      ) : (
                        <span className="vault-territory-art jolly-art" aria-hidden="true"><b>🌍</b><small>Ogni territorio</small></span>
                      )}
                      <small>CARTA TERRITORIO · {territory ? CONTINENTS[territory.continent].name : "UNIVERSALE"}</small>
                      <h3>{territory?.name ?? "Jolly universale"}</h3>
                      <p>{territory ? `${SYMBOL_LABELS[card.symbol]} · ${CONTINENTS[territory.continent].name}` : "Sostituisce un simbolo in una coppia uguale"}</p>
                      {owned && <strong>+2 SUL TERRITORIO SE ENTRA NEL TRIS</strong>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="cards-vault-empty"><span>◇</span><h3>Nessuna carta</h3><p>Conquista almeno un territorio e termina il turno per pescarne una.</p></div>
            )}
            <section className={`vault-trade-dock ${mandatory ? "mandatory" : ""}`}>
              <div>
                <span>CAMBIO CARTE</span>
                <b>{selected.length}/3 selezionate</b>
                <small>3 uguali: +8 · 3 diverse: +10 · coppia + Jolly: +12</small>
              </div>
              <div className="vault-trade-value"><small>RINFORZI</small><b>{value ? `+${value}` : "—"}</b></div>
              <button className="primary-button" disabled={busy || !canTradeNow || selected.length !== 3 || value <= 0} onClick={() => void playSet()}>
                {!canTradeNow ? "Disponibile nel tuo turno" : selected.length !== 3 ? "Scegli 3 carte" : value ? `Gioca il tris · +${value}` : "Tris non valido"}
              </button>
            </section>
            <footer><span>{player.cardCount} {player.cardCount === 1 ? "carta posseduta" : "carte possedute"}</span><small>Gli altri giocatori vedono soltanto il numero, mai il contenuto.</small></footer>
          </section>
        </div>
      )}
    </>
  );
}

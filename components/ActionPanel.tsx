"use client";

import { useState, type CSSProperties } from "react";
import { SYMBOL_LABELS, TERRITORY_BY_ID, type TerritoryId } from "@/lib/game-data";
import type { GameAction, PublicPlayer, RoomEnvelope } from "@/lib/game-types";

const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function DiceRow({ values, tone }: { values: number[]; tone: "attack" | "defense" }) {
  return <div className={`dice-row ${tone}`}>{values.map((value, index) => <span key={`${value}-${index}`}>{DIE[value]}</span>)}</div>;
}

function CardHand({ player, selected, onToggle }: { player: PublicPlayer; selected: string[]; onToggle: (id: string) => void }) {
  if (!player.cards.length) return <p className="empty-hand">Non hai ancora carte. Conquista almeno un territorio durante il turno per pescarne una.</p>;
  return (
    <div className="card-hand">
      {player.cards.map((card) => (
        <button key={card.id} className={selected.includes(card.id) ? "selected" : ""} onClick={() => onToggle(card.id)}>
          <span className={`card-symbol ${card.symbol}`}>{card.symbol === "fanteria" ? "▲" : card.symbol === "cavalleria" ? "◆" : card.symbol === "artiglieria" ? "●" : "★"}</span>
          <b>{SYMBOL_LABELS[card.symbol]}</b><small>{card.territoryId ? TERRITORY_BY_ID[card.territoryId].name : "Carta universale"}</small>
        </button>
      ))}
    </div>
  );
}

export default function ActionPanel({
  envelope,
  selectedFrom,
  selectedTo,
  setSelectedFrom,
  setSelectedTo,
  setupAmount,
  setSetupAmount,
  deployAmount,
  setDeployAmount,
  action,
  busy,
}: {
  envelope: RoomEnvelope;
  selectedFrom?: TerritoryId;
  selectedTo?: TerritoryId;
  setSelectedFrom: (value?: TerritoryId) => void;
  setSelectedTo: (value?: TerritoryId) => void;
  setupAmount: number;
  setSetupAmount: (value: number) => void;
  deployAmount: number;
  setDeployAmount: (value: number) => void;
  action: (action: GameAction) => Promise<void>;
  busy: boolean;
}) {
  const { state, meId } = envelope;
  const me = state.players.find((player) => player.id === meId)!;
  const isTurn = state.currentPlayerId === meId;
  const [dice, setDice] = useState(3);
  const [fortifyAmount, setFortifyAmount] = useState(1);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const name = (id?: TerritoryId) => id ? TERRITORY_BY_ID[id].name : "—";
  const maxAttackDice = selectedFrom ? Math.max(0, Math.min(3, state.territories[selectedFrom].armies - 1)) : 0;
  const maxFortify = selectedFrom ? Math.max(0, state.territories[selectedFrom].armies - 1) : 0;

  if (state.phase === "setup") return (
    <section className="action-panel">
      <div className="action-kicker">FASE 0 · PREPARAZIONE</div><h2>Schiera le tue forze</h2>
      <p>Hai <b>{me.setupPool} armate</b> ancora da distribuire. Scegli una quantità e tocca un tuo territorio.</p>
      <div className="amount-picker">
        {[1, 3, 5].map((value) => <button key={value} className={setupAmount === value ? "active" : ""} disabled={value > me.setupPool} onClick={() => setSetupAmount(value)}>+{value}</button>)}
        <button className={setupAmount === me.setupPool ? "active" : ""} disabled={!me.setupPool} onClick={() => setSetupAmount(me.setupPool)}>Tutte</button>
      </div>
      <p className="selection-note">Quantità selezionata: <b>{Math.min(setupAmount, me.setupPool)}</b></p>
      <button className="secondary-button full-button" disabled={busy || !me.setupPool} onClick={() => action({ type: "autoSetup" })}>Distribuzione rapida equilibrata</button>
      {!me.setupPool && <div className="waiting-host"><span className="pulse-dot" /> In attesa degli altri schieramenti…</div>}
    </section>
  );

  if (!isTurn && state.phase !== "gameover") {
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    const battle = state.pendingBattle;
    if (battle?.defenderId === meId) {
      const maxDefense = Math.min(3, state.territories[battle.to].armies);
      return (
        <section className="action-panel waiting-panel">
          <div className="action-kicker">ATTACCO IN ARRIVO</div><h2>Difendi {name(battle.to)}</h2>
          <p>{current?.name} ha ottenuto:</p><DiceRow values={battle.attackerDice} tone="attack" />
          <p>Scegli i dadi di difesa. In caso di parità, vinci tu.</p>
          <div className="dice-choice">{Array.from({ length: maxDefense }, (_, index) => index + 1).map((value) => <button key={value} className={Math.min(dice, maxDefense) === value ? "active" : ""} onClick={() => setDice(value)}>{value} {value === 1 ? "dado" : "dadi"}</button>)}</div>
          <button className="danger-button full-button" disabled={busy} onClick={() => action({ type: "defend", dice: Math.min(dice, maxDefense) })}>Lancia e difendi</button>
        </section>
      );
    }
    return (
      <section className="action-panel waiting-panel">
        <div className="action-kicker">TURNO AVVERSARIO</div><span className="large-pulse" style={{ "--player-color": current?.color ?? "#d5b56e" } as CSSProperties}>{current?.name.slice(0, 1)}</span>
        <h2>Sta giocando {current?.name}</h2><p>La mappa si aggiorna automaticamente. Studia i confini o usa il canale diplomatico.</p>
      </section>
    );
  }

  if (state.phase === "reinforce") return (
    <section className="action-panel">
      <div className="action-kicker">FASE 1 · RINFORZI</div><h2>{state.reinforcementPool ? `${state.reinforcementPool} armate da schierare` : "Schieramento completato"}</h2>
      <p>{state.reinforcementPool ? "Scegli una quantità e poi tocca uno dei tuoi territori." : "Puoi cambiare un tris oppure iniziare gli attacchi."}</p>
      {state.reinforcementPool > 0 && <div className="amount-picker">
        {[1, 3, 5].map((value) => <button key={value} className={deployAmount === value ? "active" : ""} disabled={value > state.reinforcementPool} onClick={() => setDeployAmount(value)}>+{value}</button>)}
        <button className={deployAmount === state.reinforcementPool ? "active" : ""} onClick={() => setDeployAmount(state.reinforcementPool)}>Tutte</button>
      </div>}
      <details className="cards-detail" open={me.cards.length >= 5}>
        <summary>Le tue carte <span>{me.cardCount}</span>{me.cards.length >= 5 && <em>CAMBIO OBBLIGATORIO</em>}</summary>
        <CardHand player={me} selected={selectedCards} onToggle={(id) => setSelectedCards((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current)} />
        <button className="secondary-button full-button" disabled={busy || selectedCards.length !== 3} onClick={() => action({ type: "tradeCards", cardIds: selectedCards })}>Gioca il tris selezionato</button>
      </details>
      <button className="primary-button full-button" disabled={busy || state.reinforcementPool > 0 || me.cards.length >= 5} onClick={() => action({ type: "beginAttack" })}>{state.resumePhase === "attack" ? "Riprendi gli attacchi" : "Passa agli attacchi"}</button>
    </section>
  );

  if (state.phase === "attack") {
    const battle = state.pendingBattle;
    return (
      <section className="action-panel">
        <div className="action-kicker">FASE 2 · ATTACCO</div>
        {battle ? <><h2>Battaglia in attesa</h2><div className="battle-route"><span>{name(battle.from)}</span><b>→</b><span>{name(battle.to)}</span></div><p>Hai lanciato:</p><DiceRow values={battle.attackerDice} tone="attack" /><div className="waiting-host"><span className="pulse-dot" /> Il difensore sceglie i suoi dadi…</div></>
          : state.pendingMove ? <p>Completa lo spostamento dopo la conquista.</p>
          : selectedFrom && selectedTo ? <>
            <h2>Prepara l&apos;attacco</h2><div className="battle-route"><span>{name(selectedFrom)} <small>{state.territories[selectedFrom].armies}</small></span><b>→</b><span>{name(selectedTo)} <small>{state.territories[selectedTo].armies}</small></span></div>
            <p>Quanti dadi vuoi lanciare?</p><div className="dice-choice">{Array.from({ length: maxAttackDice }, (_, index) => index + 1).map((value) => <button key={value} className={Math.min(dice, maxAttackDice) === value ? "active" : ""} onClick={() => setDice(value)}>{DIE[value]} {value}</button>)}</div>
            <button className="danger-button full-button" disabled={busy} onClick={async () => { await action({ type: "attack", from: selectedFrom, to: selectedTo, dice: Math.min(dice, maxAttackDice) }); setSelectedTo(undefined); }}>Lancia i dadi d&apos;attacco</button>
            <button className="text-button" onClick={() => { setSelectedFrom(undefined); setSelectedTo(undefined); }}>Cambia territori</button>
          </> : <><h2>{selectedFrom ? "Scegli il bersaglio" : "Scegli da dove attaccare"}</h2><p>{selectedFrom ? `Hai selezionato ${name(selectedFrom)}. Ora tocca un territorio nemico confinante.` : "Tocca un tuo territorio con almeno 2 armate, poi un confine avversario."}</p>{selectedFrom && <button className="text-button" onClick={() => setSelectedFrom(undefined)}>Annulla selezione</button>}</>}
        {!battle && !state.pendingMove && <button className="secondary-button full-button end-phase" disabled={busy} onClick={() => { setSelectedFrom(undefined); setSelectedTo(undefined); action({ type: "endAttack" }); }}>Concludi gli attacchi</button>}
      </section>
    );
  }

  if (state.phase === "fortify") return (
    <section className="action-panel">
      <div className="action-kicker">FASE 3 · SPOSTAMENTO</div><h2>{state.fortifyUsed ? "Dominio consolidato" : selectedFrom ? "Scegli la destinazione" : "Spostamento strategico"}</h2>
      <p>{state.fortifyUsed ? "Hai già spostato le armate. Puoi terminare il turno." : "Puoi spostare armate una sola volta tra due territori collegati del tuo dominio."}</p>
      {!state.fortifyUsed && selectedFrom && selectedTo && <><div className="battle-route"><span>{name(selectedFrom)}</span><b>→</b><span>{name(selectedTo)}</span></div><input className="range-input" type="range" min={1} max={Math.max(1, maxFortify)} value={Math.min(fortifyAmount, Math.max(1, maxFortify))} onChange={(event) => setFortifyAmount(Number(event.target.value))} /><div className="range-label"><span>1</span><b>{Math.min(fortifyAmount, maxFortify)} armate</b><span>{maxFortify}</span></div><button className="primary-button full-button" disabled={busy || maxFortify < 1} onClick={() => action({ type: "fortify", from: selectedFrom, to: selectedTo, amount: Math.min(fortifyAmount, maxFortify) })}>Conferma spostamento</button></>}
      {!state.fortifyUsed && selectedFrom && !selectedTo && <p className="selection-note">Partenza: <b>{name(selectedFrom)}</b>. Tocca un altro tuo territorio collegato.</p>}
      <button className="secondary-button full-button end-phase" disabled={busy} onClick={() => action({ type: "endTurn" })}>Termina turno {state.conqueredThisTurn ? "e pesca una carta" : ""}</button>
    </section>
  );

  const winner = state.players.find((player) => player.id === state.winnerId);
  return <section className="action-panel victory-panel"><div className="victory-laurel">✦</div><div className="action-kicker">CAMPAGNA CONCLUSA</div><h2>{winner?.name} domina il mondo</h2><p>{state.victoryReason}</p>{state.hostId === meId && <button className="primary-button full-button" disabled={busy} onClick={() => action({ type: "rematch" })}>Inizia una rivincita</button>}</section>;
}

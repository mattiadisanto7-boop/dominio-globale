"use client";

import { useState, type CSSProperties } from "react";
import { GraphicDiceRow, PipDie } from "@/components/DiceArena";
import { mustTradeCards } from "@/lib/card-rules";
import { TERRITORY_BY_ID, attackDiceForArmies, canAttackMatchup, defenseDiceForArmies, type TerritoryId } from "@/lib/game-data";
import type { GameAction, RoomEnvelope } from "@/lib/game-types";

export function DiceRow({ values, tone }: { values: number[]; tone: "attack" | "defense" }) {
  return <GraphicDiceRow values={values} tone={tone} />;
}

export default function ActionPanel({
  envelope,
  selectedFrom,
  selectedTo,
  setSelectedFrom,
  setSelectedTo,
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
  deployAmount: number;
  setDeployAmount: (value: number) => void;
  action: (action: GameAction) => Promise<void>;
  busy: boolean;
}) {
  const { state, meId } = envelope;
  const me = state.players.find((player) => player.id === meId);
  const isTurn = state.currentPlayerId === meId;
  const [fortifyAmount, setFortifyAmount] = useState(1);

  if (envelope.role === "spectator" || !me) {
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    return (
      <section className="action-panel spectator-panel">
        <div className="action-kicker">MODALITÀ SPETTATORE · LIVE</div>
        <span className="spectator-eye">◉</span>
        <h2>{state.phase === "gameover" ? "Campagna conclusa" : `Turno di ${current?.name ?? "preparazione"}`}</h2>
        <p>Stai osservando la partita in diretta. Obiettivi, carte e pescate private dei comandanti sono nascosti dal server.</p>
        <div className="spectator-counter"><b>{envelope.spectatorCount}</b><span>{envelope.spectatorCount === 1 ? "spettatore collegato" : "spettatori collegati"}</span></div>
      </section>
    );
  }

  const name = (id?: TerritoryId) => id ? TERRITORY_BY_ID[id].name : "—";
  const mustTrade = mustTradeCards(me.cards);
  const maxAttackDice = selectedFrom ? attackDiceForArmies(state.territories[selectedFrom].armies) : 0;
  const maxDefenseDice = selectedTo ? defenseDiceForArmies(state.territories[selectedTo].armies) : 0;
  const legalAttack = selectedFrom && selectedTo
    ? canAttackMatchup(state.territories[selectedFrom].armies, state.territories[selectedTo].armies)
    : false;
  const sourceMinimum = selectedFrom && TERRITORY_BY_ID[selectedFrom].adjacent.some(
    (territoryId) => state.territories[territoryId].ownerId !== meId,
  ) ? 2 : 1;
  const maxFortify = selectedFrom ? Math.max(0, state.territories[selectedFrom].armies - sourceMinimum) : 0;

  if (state.phase === "setup") {
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    const batch = state.setupBatchRemaining;
    if (!isTurn) return (
      <section className="action-panel waiting-panel">
        <div className="action-kicker">SCHIERAMENTO ALTERNATO</div>
        <span className="large-pulse" style={{ "--player-color": current?.color ?? "#d5b56e" } as CSSProperties}>{current?.isBot ? "◆" : current?.name.slice(0, 1)}</span>
        <h2>{current?.isBot ? `${current.name} sta pianificando` : `Tocca a ${current?.name}`}</h2>
        <p>Il comandante piazza 1 armata per volta, anche su territori differenti. Ne restano {state.setupBatchRemaining} prima del cambio automatico.</p>
        <div className="setup-counter"><span>LE TUE ARMATE DA SCHIERARE</span><b>{me.setupPool}</b></div>
      </section>
    );
    return (
      <section className="action-panel setup-turn-panel">
        <div className="action-kicker">FASE 0 · TOCCA A TE</div><h2>Piazza 1 armata</h2>
        <p>Hai <b>{me.setupPool} armate</b> ancora da distribuire. Per questo passaggio puoi scegliere {batch === 1 ? "ancora un territorio" : `fino a ${batch} territori anche diversi`}, un&apos;armata alla volta.</p>
        <div className="setup-batch"><span>PRIMA DEL CAMBIO</span><b>{batch}</b><small>{batch === 1 ? "ultimo piazzamento" : "piazzamenti rimanenti"}</small></div>
        <button className="secondary-button full-button" disabled={busy || !me.setupPool} onClick={() => action({ type: "autoSetup" })}>Distribuisci automaticamente i {batch} piazzamenti rimasti</button>
      </section>
    );
  }

  if (!isTurn && state.phase !== "gameover") {
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    return (
      <section className="action-panel waiting-panel">
        <div className="action-kicker">{current?.isBot ? "TURNO DEL BOT" : "TURNO AVVERSARIO"}</div><span className="large-pulse" style={{ "--player-color": current?.color ?? "#d5b56e" } as CSSProperties}>{current?.isBot ? "◆" : current?.name.slice(0, 1)}</span>
        <h2>Sta giocando {current?.name}</h2><p>{current?.isBot ? "Il generale virtuale osserva la mappa, rinforza i confini e attacca applicando le stesse regole dei giocatori." : "La mappa si aggiorna automaticamente. Se vieni attaccato, i tuoi dadi di difesa vengono lanciati dal server senza interrompere il flusso."}</p>
      </section>
    );
  }

  if (state.phase === "reinforce") return (
    <section className="action-panel">
      <div className="action-kicker">FASE 1 · RINFORZI</div><h2>{state.reinforcementPool ? `${state.reinforcementPool} armate da schierare` : "Schieramento completato"}</h2>
      <p>{mustTrade ? "Hai 5 o più carte e un tris valido: apri “Le tue carte”, selezionane tre e giocalo direttamente dal mazzo." : state.reinforcementPool ? "Scegli una quantità e poi tocca uno dei tuoi territori. Dopo l'ultima armata inizierà subito la fase d'attacco." : "Controllo delle carte in corso prima dell'attacco automatico."}</p>
      {state.reinforcementPool > 0 && !mustTrade && <div className="amount-picker">
        {[1, 3, 5].map((value) => <button key={value} className={deployAmount === value ? "active" : ""} disabled={value > state.reinforcementPool} onClick={() => setDeployAmount(value)}>+{value}</button>)}
        <button className={deployAmount === state.reinforcementPool ? "active" : ""} onClick={() => setDeployAmount(state.reinforcementPool)}>Tutte</button>
      </div>}
      {mustTrade && <div className="cards-vault-hint"><span>◆</span><div><b>Cambio obbligatorio</b><small>Il comando per il tris è dentro “Le tue carte”.</small></div></div>}
      {!state.reinforcementPool && <div className="waiting-host"><span className="pulse-dot" /> {mustTrade ? "Apri le tue carte e gioca il tris per continuare." : "Passaggio automatico agli attacchi…"}</div>}
    </section>
  );

  if (state.phase === "attack") {
    const battle = state.pendingBattle;
    const repeatAttack = Boolean(
      selectedFrom &&
      selectedTo &&
      state.lastBattle &&
      !state.lastBattle.conquered &&
      state.lastBattle.from === selectedFrom &&
      state.lastBattle.to === selectedTo,
    );
    return (
      <section className="action-panel">
        <div className="action-kicker">FASE 2 · ATTACCO</div>
        {battle ? <><h2>Battaglia in attesa</h2><div className="battle-route"><span>{name(battle.from)}</span><b>→</b><span>{name(battle.to)}</span></div><p>Hai lanciato:</p><DiceRow values={battle.attackerDice} tone="attack" /><div className="waiting-host"><span className="pulse-dot" /> Il difensore sta lanciando automaticamente…</div></>
          : state.pendingMove ? <p>Completa lo spostamento dopo la conquista.</p>
          : selectedFrom && selectedTo ? <>
            <h2>{repeatAttack ? "Vuoi attaccare ancora?" : "Prepara l'attacco"}</h2><div className="battle-route"><span>{name(selectedFrom)} <small>{state.territories[selectedFrom].armies}</small></span><b>→</b><span>{name(selectedTo)} <small>{state.territories[selectedTo].armies}</small></span></div>
            <p>{repeatAttack ? "Il territorio ha resistito. Puoi rilanciare subito gli stessi due territori senza selezionarli di nuovo." : "Premi tu una sola volta: i dadi d'attacco e quelli del difensore verranno calcolati con il massimo regolamentare."}</p>
            <div className="automatic-dice-pair"><div className="automatic-dice attack"><div>{Array.from({ length: maxAttackDice }, (_, index) => <PipDie key={index} value={index + 1} tone="attack" />)}</div><b>{maxAttackDice} {maxAttackDice === 1 ? "DADO" : "DADI"} D&apos;ATTACCO</b></div><div className="automatic-dice defense"><div>{Array.from({ length: maxDefenseDice }, (_, index) => <PipDie key={index} value={index + 1} tone="defense" />)}</div><b>{maxDefenseDice} {maxDefenseDice === 1 ? "DADO" : "DADI"} DI DIFESA · AUTO</b></div></div>
            {!legalAttack && <p className="attack-rule-warning">Questo attacco rischierebbe di azzerare il territorio di partenza: scegli un bersaglio meno presidiato.</p>}
            <button className={`danger-button full-button ${repeatAttack ? "repeat-attack" : ""}`} disabled={busy || maxAttackDice < 1 || !legalAttack} onClick={() => action({ type: "attack", from: selectedFrom, to: selectedTo })}>{repeatAttack ? "Attacca ancora" : "Lancia i dadi e risolvi la battaglia"}</button>
            <button className="text-button" onClick={() => { setSelectedFrom(undefined); setSelectedTo(undefined); }}>Cambia territori</button>
          </> : <><h2>{selectedFrom ? "Scegli il bersaglio" : "Scegli da dove attaccare"}</h2><p>{selectedFrom ? `Hai selezionato ${name(selectedFrom)}. Ora tocca un territorio nemico confinante.` : "Tocca un tuo territorio con almeno 2 armate, poi un confine avversario."}</p>{selectedFrom && <button className="text-button" onClick={() => setSelectedFrom(undefined)}>Annulla selezione</button>}</>}
        {!battle && !state.pendingMove && <button className="secondary-button full-button end-phase" disabled={busy} onClick={() => { setSelectedFrom(undefined); setSelectedTo(undefined); action({ type: "endAttack" }); }}>Concludi gli attacchi</button>}
      </section>
    );
  }

  if (state.phase === "fortify") return (
    <section className="action-panel">
      <div className="action-kicker">FASE 3 · SPOSTAMENTO</div><h2>{state.fortifyUsed ? "Dominio consolidato" : selectedFrom ? "Scegli la destinazione" : "Spostamento strategico"}</h2>
      <p>{state.fortifyUsed ? "Hai già spostato le armate. Puoi terminare il turno." : "Puoi spostare armate una sola volta tra due territori collegati. Da un confine nemico devono restare almeno 2 armate."}</p>
      {!state.fortifyUsed && selectedFrom && selectedTo && <><div className="battle-route"><span>{name(selectedFrom)}</span><b>→</b><span>{name(selectedTo)}</span></div><input className="range-input" type="range" min={1} max={Math.max(1, maxFortify)} value={Math.min(fortifyAmount, Math.max(1, maxFortify))} onChange={(event) => setFortifyAmount(Number(event.target.value))} /><div className="range-label"><span>1</span><b>{Math.min(fortifyAmount, maxFortify)} armate</b><span>{maxFortify}</span></div><button className="primary-button full-button" disabled={busy || maxFortify < 1} onClick={() => action({ type: "fortify", from: selectedFrom, to: selectedTo, amount: Math.min(fortifyAmount, maxFortify) })}>Conferma spostamento</button></>}
      {!state.fortifyUsed && selectedFrom && !selectedTo && <p className="selection-note">Partenza: <b>{name(selectedFrom)}</b>. Tocca un altro tuo territorio collegato. Presidio minimo: <b>{sourceMinimum}</b>.</p>}
      <button className="secondary-button full-button end-phase" disabled={busy} onClick={() => action({ type: "endTurn" })}>Termina turno {state.conqueredThisTurn ? "e pesca una carta" : ""}</button>
    </section>
  );

  const winner = state.players.find((player) => player.id === state.winnerId);
  return <section className="action-panel victory-panel"><div className="victory-laurel">✦</div><div className="action-kicker">CAMPAGNA CONCLUSA</div><h2>{winner ? `${winner.name} domina il mondo` : "Partita chiusa"}</h2><p>{state.victoryReason}</p>{winner && state.hostId === meId && <button className="primary-button full-button" disabled={busy} onClick={() => action({ type: "rematch" })}>Inizia una rivincita</button>}</section>;
}

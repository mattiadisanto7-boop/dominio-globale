"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ActionPanel, { DiceRow } from "@/components/ActionPanel";
import Brand from "@/components/Brand";
import LobbyScreen from "@/components/LobbyScreen";
import WorldMap from "@/components/WorldMap";
import { CONTINENTS, TERRITORIES, TERRITORY_BY_ID, type ContinentId, type TerritoryId } from "@/lib/game-data";
import type { GameAction, PublicGameState, PublicPlayer, RoomEnvelope } from "@/lib/game-types";

const PHASE_LABELS: Record<PublicGameState["phase"], string> = {
  lobby: "Sala d'attesa", setup: "Schieramento", reinforce: "Rinforzi", attack: "Attacco", fortify: "Spostamento", gameover: "Partita conclusa",
};

const readError = (payload: unknown, fallback: string) => payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
}

function instruction(state: PublicGameState, meId: string) {
  const mine = state.currentPlayerId === meId;
  if (state.phase === "setup") return "Distribuisci le armate iniziali sui tuoi territori.";
  if (state.phase === "reinforce") return mine ? "Tocca un tuo territorio per rinforzarlo." : "L'avversario sta schierando i rinforzi.";
  if (state.phase === "attack") return mine ? "Scegli un tuo territorio, poi un confine nemico." : "Osserva l'attacco e preparati a difendere.";
  if (state.phase === "fortify") return mine ? "Sposta armate o termina il turno." : "L'avversario sta consolidando il dominio.";
  return "";
}

function PlayerStrip({ state, meId }: { state: PublicGameState; meId: string }) {
  return <div className="player-strip">{state.players.map((player) => {
    const territories = TERRITORIES.filter((territory) => state.territories[territory.id].ownerId === player.id);
    const armies = territories.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
    return (
      <article key={player.id} className={`strip-player ${state.currentPlayerId === player.id ? "current" : ""} ${player.status !== "active" ? "inactive" : ""}`} style={{ "--player-color": player.color } as React.CSSProperties}>
        <span className="strip-avatar">{player.name.slice(0, 1).toUpperCase()}</span><div><b>{player.name}{player.id === meId ? " · tu" : ""}</b><small>{territories.length} territori · {armies} armate · {player.cardCount} carte</small></div>
        {state.currentPlayerId === player.id && state.phase !== "gameover" && <span className="turn-flag">TURNO</span>}
        {player.status !== "active" && <span className="turn-flag eliminated">{player.status === "resigned" ? "RITIRATO" : "ELIMINATO"}</span>}
      </article>
    );
  })}</div>;
}

function ObjectiveCard({ player }: { player: PublicPlayer }) {
  return <article className="objective-card"><div><span>OBIETTIVO SEGRETO</span><small>Solo tu puoi leggerlo</small></div><h3>{player.objective?.title ?? "Missione in preparazione"}</h3><p>{player.objective?.description ?? "L'obiettivo verrà assegnato all'inizio della partita."}</p>{player.objective?.fallback && <em>{player.objective.fallback}</em>}<dl className="player-stats"><div><dt>{player.stats.attacks}</dt><dd>attacchi</dd></div><div><dt>{player.stats.territoriesConquered}</dt><dd>conquiste</dd></div><div><dt>{player.stats.armiesDefeated}</dt><dd>armate eliminate</dd></div></dl></article>;
}

function ActivityLog({ state }: { state: PublicGameState }) {
  return <details className="activity-log"><summary>Registro della campagna <span>{state.log.length}</span></summary><div>{state.log.slice(0, 14).map((item) => <p key={item.id} className={item.kind}><time>{new Date(item.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time>{item.text}</p>)}</div></details>;
}

function ConquestDialog({ move, action, busy }: { move: NonNullable<PublicGameState["pendingMove"]>; action: (action: GameAction) => Promise<void>; busy: boolean }) {
  const [amount, setAmount] = useState(move.min);
  return (
    <div className="modal-backdrop battle-backdrop" role="dialog" aria-modal="true" aria-label="Sposta dopo la conquista">
      <div className="conquest-modal"><span className="conquest-icon">⚑</span><span className="eyebrow"><i /> Territorio conquistato</span><h2>{TERRITORY_BY_ID[move.to].name} è tuo</h2><p>Sposta le armate d&apos;occupazione da {TERRITORY_BY_ID[move.from].name}. Devi lasciarne almeno una indietro.</p>
        <input className="range-input" type="range" min={move.min} max={move.max} value={Math.min(amount, move.max)} onChange={(event) => setAmount(Number(event.target.value))} /><div className="range-label"><span>{move.min}</span><b>{Math.min(amount, move.max)} armate</b><span>{move.max}</span></div>
        <button className="primary-button full-button" disabled={busy} onClick={() => action({ type: "moveAfterConquest", amount: Math.min(amount, move.max) })}>Occupa il territorio</button>
      </div>
    </div>
  );
}

function ConquestOverlay({ state, meId, action, busy }: { state: PublicGameState; meId: string; action: (action: GameAction) => Promise<void>; busy: boolean }) {
  const move = state.pendingMove;
  if (!move || move.playerId !== meId) return null;
  return <ConquestDialog key={`${move.from}-${move.to}-${move.min}-${move.max}`} move={move} action={action} busy={busy} />;
}

function ChatDrawer({ state, meId, action }: { state: PublicGameState; meId: string; action: (action: GameAction) => Promise<void> }) {
  const [open, setOpen] = useState(false), [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ behavior: "smooth" }); }, [open, state.messages.length]);
  const send = async (event: FormEvent) => { event.preventDefault(); if (!text.trim()) return; const message = text; setText(""); await action({ type: "sendMessage", text: message }); };
  return <><button className={`chat-fab ${open ? "open" : ""}`} onClick={() => setOpen((value) => !value)}>{open ? "×" : "✦"}<span>{open ? "Chiudi" : "Diplomazia"}</span></button>{open && <aside className="chat-drawer"><div className="chat-heading"><div><b>Canale diplomatico</b><small>Visibile a tutta la sala</small></div></div><div className="chat-messages">
    {!state.messages.length && <p className="empty-chat">Nessun messaggio. Una tregua sospetta…</p>}
    {state.messages.map((message) => { const player = state.players.find((item) => item.id === message.playerId); return <div className={`chat-message ${message.playerId === meId ? "mine" : ""}`} key={message.id}><small style={{ color: player?.color }}>{player?.name}</small><p>{message.text}</p></div>; })}<div ref={end} />
  </div><form onSubmit={send}><input value={text} onChange={(event) => setText(event.target.value.slice(0, 180))} placeholder="Scrivi un messaggio…" /><button>Invia</button></form></aside>}</>;
}

export default function GameRoom({ envelope, onEnvelope, token, onLeave }: { envelope: RoomEnvelope; onEnvelope: (value: RoomEnvelope) => void; token: string; onLeave: () => void }) {
  const { state, meId } = envelope;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selectedFrom, setSelectedFrom] = useState<TerritoryId>(), [selectedTo, setSelectedTo] = useState<TerritoryId>();
  const [setupAmount, setSetupAmount] = useState(1), [deployAmount, setDeployAmount] = useState(1);
  const [now, setNow] = useState(0), [menuOpen, setMenuOpen] = useState(false);
  const loading = useRef(false);

  const load = useCallback(async (silent = true) => {
    if (loading.current) return; loading.current = true;
    try {
      const response = await fetch(`/api/rooms/${state.code}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = (await response.json()) as RoomEnvelope & { error?: string };
      if (!response.ok) throw new Error(readError(payload, "Sincronizzazione non riuscita."));
      if (payload.version !== envelope.version) {
        if (payload.state.phase !== state.phase || payload.state.currentPlayerId !== state.currentPlayerId) {
          setSelectedFrom(undefined);
          setSelectedTo(undefined);
        }
        onEnvelope(payload);
      }
    } catch (caught) { if (!silent) setError(caught instanceof Error ? caught.message : "Sincronizzazione non riuscita."); }
    finally { loading.current = false; }
  }, [envelope.version, onEnvelope, state.code, state.currentPlayerId, state.phase, token]);

  useEffect(() => {
    const poll = window.setInterval(() => load(true), 1600), clock = window.setInterval(() => setNow(Date.now()), 1000);
    const focus = () => load(true); window.addEventListener("focus", focus);
    return () => { window.clearInterval(poll); window.clearInterval(clock); window.removeEventListener("focus", focus); };
  }, [load]);
  const action = useCallback(async (gameAction: GameAction) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${state.code}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ intent: "action", version: envelope.version, action: gameAction }) });
      const payload = (await response.json()) as RoomEnvelope & { error?: string };
      if (response.status === 409) { await load(false); throw new Error("La mappa è appena cambiata. Ho sincronizzato tutto: riprova ora."); }
      if (!response.ok) throw new Error(readError(payload, "Azione non riuscita."));
      if (payload.state.phase !== state.phase || payload.state.currentPlayerId !== state.currentPlayerId) {
        setSelectedFrom(undefined);
        setSelectedTo(undefined);
      }
      onEnvelope(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Azione non riuscita."); }
    finally { setBusy(false); }
  }, [busy, envelope.version, load, onEnvelope, state.code, state.currentPlayerId, state.phase, token]);

  const onTerritory = (id: TerritoryId) => {
    const territory = state.territories[id], me = state.players.find((player) => player.id === meId)!;
    if (state.phase === "setup" && territory.ownerId === meId && me.setupPool > 0) { action({ type: "placeSetup", territoryId: id, amount: Math.max(1, Math.min(setupAmount, me.setupPool)) }); return; }
    if (state.currentPlayerId !== meId || busy) return;
    if (state.phase === "reinforce" && territory.ownerId === meId && state.reinforcementPool > 0) { action({ type: "deploy", territoryId: id, amount: Math.max(1, Math.min(deployAmount, state.reinforcementPool)) }); return; }
    if (state.phase === "attack" && !state.pendingBattle && !state.pendingMove) {
      if (!selectedFrom) { if (territory.ownerId === meId && territory.armies > 1) setSelectedFrom(id); }
      else if (id === selectedFrom) { setSelectedFrom(undefined); setSelectedTo(undefined); }
      else if (territory.ownerId === meId) { if (territory.armies > 1) { setSelectedFrom(id); setSelectedTo(undefined); } }
      else if (TERRITORY_BY_ID[selectedFrom].adjacent.includes(id)) setSelectedTo(id);
      return;
    }
    if (state.phase === "fortify" && !state.fortifyUsed && territory.ownerId === meId) {
      if (!selectedFrom) { if (territory.armies > 1) setSelectedFrom(id); }
      else if (id === selectedFrom) { setSelectedFrom(undefined); setSelectedTo(undefined); }
      else setSelectedTo(id);
    }
  };

  if (state.phase === "lobby") return <LobbyScreen envelope={envelope} action={action} busy={busy} onLeave={onLeave} />;
  const me = state.players.find((player) => player.id === meId)!;
  const remaining = state.deadlineAt && now > 0 ? state.deadlineAt - now : undefined;

  return (
    <main className="game-shell">
      <header className="game-topbar"><Brand compact /><div className="game-statusline"><span><small>FASE</small><b>{PHASE_LABELS[state.phase]}</b></span><span><small>ROUND</small><b>{state.round || "—"}</b></span>{remaining !== undefined && <span className={remaining <= 0 ? "expired" : ""}><small>TIME ATTACK</small><b>{formatTime(remaining)}</b></span>}<button className="room-chip" onClick={() => navigator.clipboard.writeText(state.code)}><small>SALA</small><b>{state.code}</b></button></div><button className="menu-button" onClick={() => setMenuOpen((value) => !value)}>•••</button>
        {menuOpen && <div className="game-menu"><button onClick={() => load(false)}>Sincronizza ora</button>{state.phase !== "gameover" && <button className="danger-text" onClick={() => action({ type: "resign" })}>Abbandona la partita</button>}<button onClick={onLeave}>Torna al menu</button></div>}
      </header>
      <PlayerStrip state={state} meId={meId} />
      <div className="game-layout">
        <section className="board-column">
          <div className="board-heading"><div><span className="live-dot" /> {instruction(state, meId)}</div><div className="continent-bonuses">{(Object.keys(CONTINENTS) as ContinentId[]).map((id) => <span key={id} style={{ "--continent-color": CONTINENTS[id].color } as React.CSSProperties}>{CONTINENTS[id].name} +{CONTINENTS[id].bonus}</span>)}</div></div>
          <WorldMap state={state} meId={meId} selectedFrom={selectedFrom} selectedTo={selectedTo} onTerritory={onTerritory} />
          {state.lastBattle && <div className="last-battle"><span>ULTIMO LANCIO</span><b>{TERRITORY_BY_ID[state.lastBattle.from].short} → {TERRITORY_BY_ID[state.lastBattle.to].short}</b><DiceRow values={state.lastBattle.attackerDice} tone="attack" /><DiceRow values={state.lastBattle.defenderDice} tone="defense" /><small>{state.lastBattle.attackerLosses} perdite attacco · {state.lastBattle.defenderLosses} difesa</small></div>}
          <div className="under-board-grid"><ObjectiveCard player={me} /><ActivityLog state={state} /></div>
        </section>
        <aside className="control-column">
          <ActionPanel envelope={envelope} selectedFrom={selectedFrom} selectedTo={selectedTo} setSelectedFrom={setSelectedFrom} setSelectedTo={setSelectedTo} setupAmount={setupAmount} setSetupAmount={setSetupAmount} deployAmount={deployAmount} setDeployAmount={setDeployAmount} action={action} busy={busy} />
          {remaining !== undefined && remaining <= 0 && state.phase !== "gameover" && <button className="danger-button full-button" onClick={() => action({ type: "claimTimeVictory" })}>Calcola il vincitore ai punti</button>}
          {error && <div className="game-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        </aside>
      </div>
      <ConquestOverlay state={state} meId={meId} action={action} busy={busy} /><ChatDrawer state={state} meId={meId} action={action} />
    </main>
  );
}

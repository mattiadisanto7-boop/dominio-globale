"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ActionPanel from "@/components/ActionPanel";
import Brand from "@/components/Brand";
import CardsVault from "@/components/CardsVault";
import DiceArena, { GraphicDiceRow } from "@/components/DiceArena";
import LobbyScreen from "@/components/LobbyScreen";
import MatchSummary from "@/components/MatchSummary";
import ObjectiveCard from "@/components/ObjectiveCard";
import SoundControl from "@/components/SoundControl";
import WorldMap from "@/components/WorldMap";
import { mustTradeCards } from "@/lib/card-rules";
import { CONTINENTS, TERRITORIES, TERRITORY_BY_ID, canAttackMatchup, type ContinentId, type TerritoryId } from "@/lib/game-data";
import { TERRITORY_CENTERS } from "@/lib/territory-shapes";
import { gameSound, type GameSound } from "@/lib/sound-engine";
import type { GameAction, PublicGameState, RoomEnvelope } from "@/lib/game-types";

const PHASE_LABELS: Record<PublicGameState["phase"], string> = {
  lobby: "Sala d'attesa", setup: "Schieramento", reinforce: "Rinforzi", attack: "Attacco", fortify: "Spostamento", gameover: "Partita conclusa",
};

const readError = (payload: unknown, fallback: string) => payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;

const ACTION_SOUNDS: Partial<Record<GameAction["type"], GameSound>> = {
  updateSettings: "ui",
  chooseColor: "ui",
  fillWithBots: "turn",
  startGame: "turn",
  kickPlayer: "ui",
  placeSetup: "deploy",
  autoSetup: "deploy",
  deploy: "deploy",
  tradeCards: "cards",
  beginAttack: "turn",
  moveAfterConquest: "deploy",
  endAttack: "ui",
  fortify: "fortify",
  sendMessage: "message",
  resign: "ui",
  rematch: "turn",
};

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
}

function instruction(state: PublicGameState, meId: string, spectator = false) {
  if (spectator) {
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    return state.phase === "gameover"
      ? "La campagna è terminata: consulta il risultato e il registro completo."
      : `Diretta pubblica · ${current?.name ?? "il server"} sta giocando la fase ${PHASE_LABELS[state.phase].toLowerCase()}.`;
  }
  const mine = state.currentPlayerId === meId;
  if (state.phase === "setup") {
    const current = state.players.find((player) => player.id === state.currentPlayerId);
    return mine
      ? `Piazza 1 armata per volta, anche su territori diversi: ${state.setupBatchRemaining} prima del cambio.`
      : `${current?.name ?? "Il prossimo comandante"} sta piazzando le sue ${state.setupBatchRemaining} armate prima del cambio.`;
  }
  if (state.phase === "reinforce") {
    const me = state.players.find((player) => player.id === meId);
    return mine ? me && mustTradeCards(me.cards) ? "Gioca prima il tris obbligatorio, poi schiera i rinforzi." : "Tocca un tuo territorio per rinforzarlo." : "L'avversario sta schierando i rinforzi.";
  }
  if (state.phase === "attack") return mine ? "Scegli un tuo territorio, poi un bersaglio consentito evidenziato sul confine." : "Osserva la battaglia: i dadi di difesa vengono lanciati automaticamente.";
  if (state.phase === "fortify") return mine ? "Sposta armate o termina il turno." : "L'avversario sta consolidando il dominio.";
  return "";
}

function PlayerStrip({ state, meId }: { state: PublicGameState; meId: string }) {
  return <div className="player-strip">{state.players.map((player) => {
    const territories = TERRITORIES.filter((territory) => state.territories[territory.id].ownerId === player.id);
    const armies = territories.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
    return (
      <article key={player.id} className={`strip-player ${state.currentPlayerId === player.id ? "current" : ""} ${player.status !== "active" ? "inactive" : ""}`} style={{ "--player-color": player.color } as React.CSSProperties}>
        <span className="strip-avatar">{player.isBot ? "◆" : player.name.slice(0, 1).toUpperCase()}</span><div><b>{player.name}{player.abandoned ? " · BOT SOSTITUTIVO" : player.isBot ? " · BOT" : player.id === meId ? " · tu" : ""}</b><small>{territories.length} territori · {armies} armate · {player.cardCount} carte</small></div>
        {state.currentPlayerId === player.id && state.phase !== "gameover" && <span className="turn-flag">TURNO</span>}
        {player.status !== "active" && <span className="turn-flag eliminated">{player.status === "resigned" ? "RITIRATO" : "ELIMINATO"}</span>}
      </article>
    );
  })}</div>;
}

function ActivityLog({ state }: { state: PublicGameState }) {
  return <details className="activity-log"><summary>Registro della campagna <span>{state.log.length}</span></summary><div>{state.log.slice(0, 14).map((item) => <p key={item.id} className={item.kind}><time>{new Date(item.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time>{item.text}</p>)}</div></details>;
}

function ConquestDialog({ state, move, action, busy, onComplete }: { state: PublicGameState; move: NonNullable<PublicGameState["pendingMove"]>; action: (action: GameAction) => Promise<void>; busy: boolean; onComplete: () => void }) {
  const [amount, setAmount] = useState(move.min);
  const sourceArmies = state.territories[move.from].armies;
  const destinationArmies = state.territories[move.to].armies;
  const selectedAmount = Math.min(amount, move.max);
  const garrisonRule = move.forcedException
    ? "L'occupazione minima rende inevitabile lasciare 1 armata nel territorio di partenza: qui si applica l'eccezione automatica."
    : move.sourceMinimum === 2
      ? "Il territorio di partenza confina ancora con un nemico: devono restarvi almeno 2 armate."
      : "Il territorio di partenza non confina con nemici: deve restarvi almeno 1 armata.";
  return (
    <div className="modal-backdrop battle-backdrop" role="dialog" aria-modal="true" aria-label="Sposta dopo la conquista">
      <div className="conquest-modal"><span className="conquest-icon">⚑</span><span className="eyebrow"><i /> Territorio conquistato</span><h2>{TERRITORY_BY_ID[move.to].name} è tuo</h2><p>Sposta le armate d&apos;occupazione da {TERRITORY_BY_ID[move.from].name}. {garrisonRule}</p>
        <div className="conquest-army-preview">
          <article><small>RIMANGONO IN</small><b>{TERRITORY_BY_ID[move.from].name}</b><span><i className="mini-tank" />{sourceArmies - selectedAmount}</span></article>
          <strong>→</strong>
          <article className="destination"><small>ARRIVANO IN</small><b>{TERRITORY_BY_ID[move.to].name}</b><span><i className="mini-tank" />{destinationArmies + selectedAmount}</span></article>
        </div>
        <input className="range-input" type="range" min={move.min} max={move.max} value={selectedAmount} onChange={(event) => setAmount(Number(event.target.value))} />
        <div className="conquest-amount-controls"><button disabled={selectedAmount <= move.min} onClick={() => setAmount((current) => Math.max(move.min, current - 1))}>−</button><div><small>ARMATE DA SPOSTARE</small><b>{selectedAmount}</b></div><button disabled={selectedAmount >= move.max} onClick={() => setAmount((current) => Math.min(move.max, current + 1))}>+</button><button className="max" onClick={() => setAmount(move.max)}>MAX</button></div>
        <div className="range-label"><span>Min {move.min}</span><b>{selectedAmount} armate</b><span>Max {move.max}</span></div>
        <button className="primary-button full-button" disabled={busy} onClick={async () => { await action({ type: "moveAfterConquest", amount: selectedAmount }); onComplete(); }}>Conferma occupazione</button>
      </div>
    </div>
  );
}

function ConquestOverlay({ state, meId, action, busy, onComplete }: { state: PublicGameState; meId: string; action: (action: GameAction) => Promise<void>; busy: boolean; onComplete: () => void }) {
  const move = state.pendingMove;
  const [visibleKey, setVisibleKey] = useState("");
  const moveKey = move ? `${move.from}-${move.to}-${move.min}-${move.max}` : "";
  const isMyMove = move?.playerId === meId;
  useEffect(() => {
    if (!moveKey || !isMyMove) return;
    const timer = window.setTimeout(() => setVisibleKey(moveKey), state.lastBattle?.conquered ? 3300 : 0);
    return () => window.clearTimeout(timer);
  }, [isMyMove, moveKey, state.lastBattle?.conquered]);
  if (!move || move.playerId !== meId || visibleKey !== moveKey) return null;
  return <ConquestDialog key={`${move.from}-${move.to}-${move.min}-${move.max}`} state={state} move={move} action={action} busy={busy} onComplete={onComplete} />;
}

function TerritoryConquestAnimation({ state }: { state: PublicGameState }) {
  const initialAt = useRef(state.lastBattle?.at);
  const [report, setReport] = useState<PublicGameState["lastBattle"]>();
  useEffect(() => {
    const next = state.lastBattle;
    if (!next?.conquered || !next.at || next.at === initialAt.current) return;
    initialAt.current = next.at;
    setReport(next);
    const close = window.setTimeout(() => setReport(undefined), 3150);
    return () => window.clearTimeout(close);
  }, [state.lastBattle]);
  if (!report) return null;
  const from = TERRITORY_CENTERS[report.from];
  const to = TERRITORY_CENTERS[report.to];
  const ownerId = state.territories[report.to].ownerId;
  const player = state.players.find((item) => item.id === ownerId);
  const route = `M ${from.x} ${from.y - 5} L ${to.x} ${to.y - 5}`;
  return (
    <div className="territory-conquest-animation" role="status" aria-live="assertive" style={{ "--march-color": player?.color ?? "#e3bd68" } as React.CSSProperties}>
      <svg viewBox="0 0 750 519" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path className="march-route" d={route} />
        {Array.from({ length: 5 }, (_, index) => (
          <g className="marching-tank" key={index}>
            <animateMotion path={route} begin={`${index * 0.16}s`} dur="1.65s" fill="freeze" calcMode="spline" keySplines=".16 .8 .24 1" />
            <rect x="-9" y="-5" width="18" height="10" rx="3" />
            <rect className="march-hull" x="-6.5" y="-4" width="13" height="8" rx="2" />
            <circle cx="1" cy="0" r="3.2" />
            <path d="M3-1 12-5" />
          </g>
        ))}
        {Array.from({ length: 6 }, (_, index) => <circle className="march-smoke" key={index} cx={to.x + (index - 2.5) * 4} cy={to.y - 8 - (index % 2) * 4} r={3 + (index % 3)} style={{ "--smoke-delay": `${index * 90}ms` } as React.CSSProperties} />)}
      </svg>
      <div className="march-banner"><span>⚑ TERRITORIO CONQUISTATO</span><b>{TERRITORY_BY_ID[report.to].name}</b><small>I carri di {player?.name ?? "attacco"} avanzano sul nuovo fronte</small></div>
    </div>
  );
}

const CONTINENT_SCENES: Record<ContinentId, { emblem: string; icons: string[]; title: string; primary: string; secondary: string }> = {
  "north-america": { emblem: "🦅", icons: ["🦬", "🦅", "🌲", "🦬", "🦅", "🌲"], title: "Le aquile sorvolano il nuovo dominio", primary: "#d88938", secondary: "#f3cb6b" },
  "south-america": { emblem: "🦜", icons: ["🦜", "🐆", "🌿", "🦜", "🐆", "🌿"], title: "La foresta celebra il suo comandante", primary: "#159987", secondary: "#63d4b4" },
  europe: { emblem: "🏰", icons: ["🏰", "⚜️", "👑", "🏰", "⚜️", "👑"], title: "Le fortezze alzano i vessilli", primary: "#8c5aa4", secondary: "#d9a4dc" },
  africa: { emblem: "🦁", icons: ["🦁", "🐘", "🦒", "🦁", "🐘", "🦒"], title: "La savana ruggisce per la vittoria", primary: "#c8782f", secondary: "#f0c15f" },
  asia: { emblem: "🐉", icons: ["🐉", "🐅", "🏯", "🐉", "🐅", "🏯"], title: "Il drago protegge il nuovo impero", primary: "#588f3d", secondary: "#b6d85f" },
  oceania: { emblem: "🦘", icons: ["🦘", "🐨", "🌊", "🦘", "🐨", "🦘"], title: "I canguri corrono sul nuovo dominio", primary: "#d54f7d", secondary: "#6bd3df" },
};

function ContinentCelebration({ state }: { state: PublicGameState }) {
  const initialAt = useRef(state.lastContinentConquest?.at);
  const [report, setReport] = useState<PublicGameState["lastContinentConquest"]>();
  useEffect(() => {
    const next = state.lastContinentConquest;
    if (!next?.at || next.at === initialAt.current) return;
    initialAt.current = next.at;
    const reveal = window.setTimeout(() => setReport(next), 3350);
    const close = window.setTimeout(() => setReport(undefined), 6900);
    return () => { window.clearTimeout(reveal); window.clearTimeout(close); };
  }, [state.lastContinentConquest]);
  if (!report) return null;
  const continent = CONTINENTS[report.continent];
  const scene = CONTINENT_SCENES[report.continent];
  const player = state.players.find((item) => item.id === report.playerId);
  return (
    <div className={`continent-celebration scene-${report.continent}`} role="status" aria-live="assertive" style={{ "--celebration-color": player?.color ?? continent.color, "--scene-primary": scene.primary, "--scene-secondary": scene.secondary } as React.CSSProperties}>
      <div className="continent-rays" />
      <div className="continent-landscape" aria-hidden="true"><i className="scene-sun" /><i className="scene-horizon one" /><i className="scene-horizon two" /></div>
      <div className="continent-fauna" aria-hidden="true">{scene.icons.map((icon, index) => <span key={`${icon}-${index}`} style={{ "--scene-index": index } as React.CSSProperties}>{icon}</span>)}</div>
      <div className="continent-particles" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ "--particle-angle": `${index * 12.857}deg`, "--particle-delay": `${index * -31}ms` } as React.CSSProperties} />)}</div>
      <div className="continent-medal"><span>{scene.emblem}</span><small>DOMINIO CONTINENTALE</small></div>
      <p>{player?.name} ha conquistato</p>
      <h2>{continent.name}</h2>
      <em className="continent-scene-title">{scene.title}</em>
      <strong>+{continent.bonus} ARMATE A OGNI TURNO</strong>
      <div className="continent-flags"><i /><i /><i /><i /><i /></div>
    </div>
  );
}

function SuddenDeathOverlay({ state }: { state: PublicGameState }) {
  const initialAt = useRef(state.lastSuddenDeath?.at);
  const [report, setReport] = useState<PublicGameState["lastSuddenDeath"]>();
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    const next = state.lastSuddenDeath;
    if (!next?.at || next.at === initialAt.current) return;
    initialAt.current = next.at;
    setReport(next);
    setRolling(!next.skipped);
    const settle = window.setTimeout(() => setRolling(false), 820);
    const close = window.setTimeout(() => setReport(undefined), next.closed ? 4100 : 3300);
    return () => { window.clearTimeout(settle); window.clearTimeout(close); };
  }, [state.lastSuddenDeath]);
  if (!report) return null;
  const player = state.players.find((item) => item.id === report.playerId);
  return (
    <div className={`sdadata-overlay ${report.closed ? "closed" : ""} ${report.skipped ? "skipped" : ""}`} role="status" aria-live="assertive">
      <span className="eyebrow"><i /> FINALE DA TORNEO</span>
      <h2>SDADATA</h2>
      <p>{player?.name}</p>
      {report.skipped ? (
        <div className="sdadata-skip"><b>{report.conqueredTerritories}</b><span>territori conquistati<br />lancio saltato</span></div>
      ) : (
        <><GraphicDiceRow values={report.dice ?? []} tone="sdadata" rolling={rolling} /><div className="sdadata-result"><b>{report.total}</b><span>chiusura ≤ {report.threshold}</span></div></>
      )}
      <strong>{report.skipped ? "LA PARTITA CONTINUA" : report.closed ? "PARTITA CHIUSA" : "LA CAMPAGNA CONTINUA"}</strong>
    </div>
  );
}

function TimedEndgamePanel({ state, remaining }: { state: PublicGameState; remaining?: number }) {
  if (!state.deadlineAt || state.phase === "gameover") return null;
  const stage = state.timedEndgame?.stage === "running" && remaining !== undefined && remaining <= 0
    ? "penultimate"
    : state.timedEndgame?.stage;
  if (!stage || stage === "running") return null;
  const copy = stage === "penultimate"
    ? ["TEMPO SCADUTO", "Completa il giro in corso. Dopo inizierà l'ultimo giro completo."]
    : stage === "last-round"
      ? ["ULTIMO GIRO", "È l'ultimo giro regolamentare. La sdadata partirà alla fine."]
      : [`SDADATA · CHIUSURA ≤ ${state.timedEndgame?.threshold ?? 4}`, "A fine turno il server lancia 2 dadi. Con 3+ conquiste il lancio viene saltato."];
  return <div className={`timed-endgame-panel ${stage}`}><span>{copy[0]}</span><p>{copy[1]}</p></div>;
}

function ChatDrawer({ state, meId, action }: { state: PublicGameState; meId: string; action: (action: GameAction) => Promise<void> }) {
  const [open, setOpen] = useState(false), [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ behavior: "smooth" }); }, [open, state.messages.length]);
  const send = async (event: FormEvent) => { event.preventDefault(); if (!text.trim()) return; const message = text; setText(""); await action({ type: "sendMessage", text: message }); };
  return <><button className={`chat-fab ${open ? "open" : ""}`} onClick={() => { gameSound.play("ui"); setOpen((value) => !value); }}>{open ? "×" : "✦"}<span>{open ? "Chiudi" : "Diplomazia"}</span></button>{open && <aside className="chat-drawer"><div className="chat-heading"><div><b>Canale diplomatico</b><small>Visibile a tutta la sala</small></div></div><div className="chat-messages">
    {!state.messages.length && <p className="empty-chat">Nessun messaggio. Una tregua sospetta…</p>}
    {state.messages.map((message) => { const player = state.players.find((item) => item.id === message.playerId); return <div className={`chat-message ${message.playerId === meId ? "mine" : ""}`} key={message.id}><small style={{ color: player?.color }}>{player?.name}</small><p>{message.text}</p></div>; })}<div ref={end} />
  </div><form onSubmit={send}><input value={text} onChange={(event) => setText(event.target.value.slice(0, 180))} placeholder="Scrivi un messaggio…" /><button>Invia</button></form></aside>}</>;
}

export default function GameRoom({ envelope, onEnvelope, token, onLeave }: { envelope: RoomEnvelope; onEnvelope: (value: RoomEnvelope) => void; token: string; onLeave: (forgetToken?: boolean) => void }) {
  const { state, meId } = envelope;
  const me = state.players.find((player) => player.id === meId);
  const isSpectator = envelope.role === "spectator";
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selectedFrom, setSelectedFrom] = useState<TerritoryId>(), [selectedTo, setSelectedTo] = useState<TerritoryId>();
  const [deployAmount, setDeployAmount] = useState(1);
  const [now, setNow] = useState(0), [menuOpen, setMenuOpen] = useState(false);
  const [initiallyFinished] = useState(state.phase === "gameover");
  const loading = useRef(false);
  const audioState = useRef({
    pendingAt: state.pendingBattle?.createdAt,
    battleAt: state.lastBattle?.at,
    continentAt: state.lastContinentConquest?.at,
    suddenDeathAt: state.lastSuddenDeath?.at,
    currentPlayerId: state.currentPlayerId,
    phase: state.phase,
    messageCount: state.messages.length,
    myCardCount: me?.cardCount ?? 0,
  });

  useEffect(() => {
    const previous = audioState.current;
    const timers: number[] = [];
    if (state.pendingBattle?.createdAt && state.pendingBattle.createdAt !== previous.pendingAt) {
      gameSound.play("dice");
    }
    if (state.lastBattle?.at && state.lastBattle.at !== previous.battleAt) {
      gameSound.play("dice");
      timers.push(window.setTimeout(() => gameSound.play(state.lastBattle?.conquered ? "conquest" : "battle"), 760));
    }
    if (state.lastContinentConquest?.at && state.lastContinentConquest.at !== previous.continentAt) {
      timers.push(window.setTimeout(() => gameSound.play("continent"), 3380));
    }
    const suddenDeathChanged = Boolean(
      state.lastSuddenDeath?.at && state.lastSuddenDeath.at !== previous.suddenDeathAt,
    );
    if (suddenDeathChanged) gameSound.play(state.lastSuddenDeath?.skipped ? "turn" : "sdadata");
    const drewCard = (me?.cardCount ?? 0) > previous.myCardCount;
    if (drewCard) gameSound.play("cards");
    if (state.phase === "gameover" && previous.phase !== "gameover") {
      timers.push(window.setTimeout(() => gameSound.play("victory"), suddenDeathChanged ? 2600 : 360));
    } else if (state.currentPlayerId && state.currentPlayerId !== previous.currentPlayerId) {
      timers.push(window.setTimeout(() => gameSound.play("turn"), drewCard ? 480 : 0));
    }
    if (state.messages.length > previous.messageCount && state.messages.at(-1)?.playerId !== meId) {
      gameSound.play("message");
    }
    audioState.current = {
      pendingAt: state.pendingBattle?.createdAt,
      battleAt: state.lastBattle?.at,
      continentAt: state.lastContinentConquest?.at,
      suddenDeathAt: state.lastSuddenDeath?.at,
      currentPlayerId: state.currentPlayerId,
      phase: state.phase,
      messageCount: state.messages.length,
      myCardCount: me?.cardCount ?? 0,
    };
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [me?.cardCount, meId, state.currentPlayerId, state.lastBattle?.at, state.lastBattle?.conquered, state.lastContinentConquest?.at, state.lastSuddenDeath?.at, state.lastSuddenDeath?.skipped, state.messages, state.pendingBattle?.createdAt, state.phase]);

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
    if (busy || isSpectator) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${state.code}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ intent: "action", version: envelope.version, action: gameAction }) });
      const payload = (await response.json()) as RoomEnvelope & { error?: string };
      if (response.status === 409) {
        await load(false);
        if (gameAction.type === "advanceBot") return;
        throw new Error("La mappa è appena cambiata. Ho sincronizzato tutto: riprova ora.");
      }
      if (!response.ok) throw new Error(readError(payload, "Azione non riuscita."));
      if (payload.state.phase !== state.phase || payload.state.currentPlayerId !== state.currentPlayerId) {
        setSelectedFrom(undefined);
        setSelectedTo(undefined);
      }
      onEnvelope(payload);
      const successSound = ACTION_SOUNDS[gameAction.type];
      if (successSound) gameSound.play(successSound);
    } catch (caught) {
      if (gameAction.type !== "advanceBot") {
        gameSound.play("error");
        setError(caught instanceof Error ? caught.message : "Azione non riuscita.");
      }
    }
    finally { setBusy(false); }
  }, [busy, envelope.version, isSpectator, load, onEnvelope, state.code, state.currentPlayerId, state.phase, token]);

  const leavePermanently = useCallback(async () => {
    if (busy || isSpectator) return;
    setBusy(true);
    setError("");
    let completed = false;
    try {
      const response = await fetch(`/api/rooms/${state.code}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(state.phase === "lobby"
          ? { intent: "leave", version: envelope.version }
          : { intent: "action", version: envelope.version, action: { type: "resign" } }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(readError(payload, "Non è stato possibile lasciare la sala."));
      completed = true;
      onLeave(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Non è stato possibile lasciare la sala.");
    } finally {
      if (!completed) setBusy(false);
    }
  }, [busy, envelope.version, isSpectator, onLeave, state.code, state.phase, token]);

  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);
  useEffect(() => {
    if (
      !currentPlayer?.isBot ||
      isSpectator ||
      busy ||
      state.phase === "lobby" ||
      state.phase === "gameover"
    ) return;
    const battleAge = state.lastBattle?.at ? Date.now() - state.lastBattle.at : Number.POSITIVE_INFINITY;
    const delay = state.pendingMove
      ? Math.max(700, 3500 - battleAge)
      : state.phase === "attack" && battleAge < 3500
        ? Math.max(700, 3500 - battleAge)
        : state.phase === "setup"
          ? 620
          : 900;
    const timer = window.setTimeout(() => void action({ type: "advanceBot" }), delay);
    return () => window.clearTimeout(timer);
  }, [action, busy, currentPlayer?.isBot, isSpectator, state.lastBattle?.at, state.pendingMove, state.phase]);

  const onTerritory = (id: TerritoryId) => {
    if (isSpectator || !me) return;
    gameSound.play("ui");
    const territory = state.territories[id];
    if (state.phase === "setup" && state.currentPlayerId === meId && territory.ownerId === meId && me.setupPool > 0) { action({ type: "placeSetup", territoryId: id }); return; }
    if (state.currentPlayerId !== meId || busy) return;
    if (state.phase === "reinforce" && territory.ownerId === meId && state.reinforcementPool > 0 && !mustTradeCards(me.cards)) { action({ type: "deploy", territoryId: id, amount: Math.max(1, Math.min(deployAmount, state.reinforcementPool)) }); return; }
    if (state.phase === "attack" && !state.pendingBattle && !state.pendingMove) {
      if (!selectedFrom) {
        if (territory.ownerId === meId && territory.armies > 1) {
          setError("");
          setSelectedFrom(id);
        }
      }
      else if (id === selectedFrom) { setSelectedFrom(undefined); setSelectedTo(undefined); }
      else if (territory.ownerId === meId) {
        if (territory.armies > 1) {
          setError("");
          setSelectedFrom(id);
          setSelectedTo(undefined);
        }
      }
      else if (TERRITORY_BY_ID[selectedFrom].adjacent.includes(id)) {
        const sourceArmies = state.territories[selectedFrom].armies;
        if (canAttackMatchup(sourceArmies, territory.armies)) {
          setError("");
          setSelectedTo(id);
        } else {
          setSelectedTo(undefined);
          setError(
            sourceArmies === 2
              ? "Da 2 armate puoi attaccare soltanto un territorio con 1 armata."
              : "Da 3 armate puoi attaccare soltanto un territorio con 1 o 2 armate.",
          );
        }
      }
      return;
    }
    if (state.phase === "fortify" && !state.fortifyUsed && territory.ownerId === meId) {
      if (!selectedFrom) {
        const minimum = TERRITORY_BY_ID[id].adjacent.some((adjacentId) => state.territories[adjacentId].ownerId !== meId) ? 2 : 1;
        if (territory.armies > minimum) setSelectedFrom(id);
      }
      else if (id === selectedFrom) { setSelectedFrom(undefined); setSelectedTo(undefined); }
      else setSelectedTo(id);
    }
  };

  if (state.phase === "lobby") return <LobbyScreen envelope={envelope} action={action} busy={busy} error={error} onLeave={() => void leavePermanently()} />;
  const remaining = state.deadlineAt && now > 0 ? state.deadlineAt - now : undefined;
  const timedStage = state.timedEndgame?.stage === "running" && remaining !== undefined && remaining <= 0
    ? "penultimate"
    : state.timedEndgame?.stage;
  const timerLabel = timedStage === "penultimate"
    ? "PENULTIMO GIRO"
    : timedStage === "last-round"
      ? "ULTIMO GIRO"
      : timedStage === "sudden-death"
        ? `SDADATA ≤${state.timedEndgame?.threshold ?? 4}`
        : "TIME ATTACK";
  const timerValue = timedStage && timedStage !== "running"
    ? timedStage === "sudden-death" ? "2 DADI" : `ROUND ${state.round}`
    : remaining !== undefined ? formatTime(remaining) : "—";

  return (
    <main className="game-shell">
      <header className="game-topbar"><Brand compact /><div className="game-statusline"><span><small>FASE</small><b>{PHASE_LABELS[state.phase]}</b></span><span><small>ROUND</small><b>{state.round || "—"}</b></span>{remaining !== undefined && <span className={timedStage && timedStage !== "running" ? "expired endgame" : ""}><small>{timerLabel}</small><b>{timerValue}</b></span>}{(isSpectator || envelope.spectatorCount > 0) && <span className="spectator-top-chip"><small>{isSpectator ? "DIRETTA" : "SPETTATORI"}</small><b>{isSpectator ? "◉ LIVE" : envelope.spectatorCount}</b></span>}<button className="room-chip" onClick={() => { gameSound.play("ui"); navigator.clipboard.writeText(state.code); }}><small>SALA</small><b>{state.code}</b></button></div><SoundControl /><button className="menu-button" onClick={() => { gameSound.play("ui"); setMenuOpen((value) => !value); }}>•••</button>
        {menuOpen && <div className="game-menu"><button onClick={() => load(false)}>Sincronizza ora</button>{!isSpectator && state.phase !== "gameover" && <button className="danger-text" disabled={busy} onClick={() => void leavePermanently()}>Abbandona e lascia il posto a un bot</button>}<button onClick={() => onLeave()}>Torna al menu</button></div>}
      </header>
      <PlayerStrip state={state} meId={meId} />
      <div className="game-layout">
        <section className="board-column">
          <div className="board-heading"><div><span className="live-dot" /> {instruction(state, meId, isSpectator)}</div><div className="continent-bonuses">{(Object.keys(CONTINENTS) as ContinentId[]).map((id) => <span key={id} style={{ "--continent-color": CONTINENTS[id].color } as React.CSSProperties}>{CONTINENTS[id].name} +{CONTINENTS[id].bonus}</span>)}</div></div>
          <div className="board-stage"><WorldMap state={state} meId={meId} selectedFrom={selectedFrom} selectedTo={selectedTo} onTerritory={onTerritory} /><DiceArena state={state} /><TerritoryConquestAnimation state={state} /></div>
          {state.lastBattle && <div className="last-battle"><span>ULTIMO LANCIO</span><b>{TERRITORY_BY_ID[state.lastBattle.from].short} → {TERRITORY_BY_ID[state.lastBattle.to].short}</b><GraphicDiceRow values={state.lastBattle.attackerDice} tone="attack" /><GraphicDiceRow values={state.lastBattle.defenderDice} tone="defense" /><small>{state.lastBattle.attackerLosses} perdite attacco · {state.lastBattle.defenderLosses} difesa</small></div>}
          <div className="under-board-grid activity-only"><ActivityLog state={state} /></div>
        </section>
        <aside className="control-column">
          {me && <CardsVault state={state} player={me} action={action} busy={busy} />}
          <TimedEndgamePanel state={state} remaining={remaining} />
          <ActionPanel envelope={envelope} selectedFrom={selectedFrom} selectedTo={selectedTo} setSelectedFrom={setSelectedFrom} setSelectedTo={setSelectedTo} deployAmount={deployAmount} setDeployAmount={setDeployAmount} action={action} busy={busy} />
          {error && <div className="game-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        </aside>
      </div>
      {me ? <section className="bottom-objective" aria-label="La tua carta obiettivo"><ObjectiveCard state={state} player={me} /></section> : <section className="spectator-privacy"><span>◉</span><div><b>Visione pubblica protetta</b><small>Carte e obiettivi personali non vengono trasmessi agli spettatori.</small></div></section>}
      {!isSpectator && <ConquestOverlay state={state} meId={meId} action={action} busy={busy} onComplete={() => { setSelectedFrom(undefined); setSelectedTo(undefined); }} />}
      <ContinentCelebration state={state} />
      <SuddenDeathOverlay state={state} />
      {state.phase === "gameover" && <MatchSummary state={state} delayForAnimations={!initiallyFinished} />}
      {!isSpectator && <ChatDrawer state={state} meId={meId} action={action} />}
    </main>
  );
}

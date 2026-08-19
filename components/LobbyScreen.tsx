"use client";

import type { CSSProperties } from "react";
import Brand from "@/components/Brand";
import SoundControl from "@/components/SoundControl";
import type { GameAction, RoomEnvelope } from "@/lib/game-types";

export default function LobbyScreen({
  envelope,
  action,
  busy,
  onLeave,
}: {
  envelope: RoomEnvelope;
  action: (action: GameAction) => Promise<void>;
  busy: boolean;
  onLeave: () => void;
}) {
  const { state, meId } = envelope;
  const isHost = state.hostId === meId;

  const copyInvite = async () => {
    const url = `${window.location.origin}${window.location.pathname}?stanza=${state.code}`;
    await navigator.clipboard.writeText(`Entra nella mia partita a Dominio Globale: ${url} — codice ${state.code}`);
    const button = document.querySelector(".invite-code span");
    if (button) {
      const original = button.textContent;
      button.textContent = "Copiato ✓";
      window.setTimeout(() => { button.textContent = original; }, 1800);
    }
  };

  const update = (key: string, value: string | number) => action({ type: "updateSettings", settings: { [key]: value } });

  return (
    <main className="lobby-shell">
      <header className="game-topbar lobby-topbar"><Brand compact /><div className="topbar-actions"><SoundControl /><button className="ghost-button" onClick={onLeave}>Torna al menu</button></div></header>
      <div className="lobby-layout">
        <section className="lobby-main">
          <span className="eyebrow"><i /> Sala privata pronta</span>
          <h1>Raduna i tuoi strateghi.</h1>
          <p>Condividi il codice. La partita inizierà soltanto quando deciderà chi ospita.</p>
          <button className="invite-code" onClick={copyInvite}><small>CODICE SALA</small><strong>{state.code}</strong><span>Copia invito</span></button>
          <div className="player-slots">
            {Array.from({ length: state.settings.maxPlayers }).map((_, index) => {
              const player = state.players[index];
              return player ? (
                <article className="lobby-player" key={player.id}>
                  <span className="player-avatar" style={{ "--player-color": player.color } as CSSProperties}>{player.isBot ? "◆" : player.name.slice(0, 1).toUpperCase()}</span>
                  <div><b>{player.name}{player.isBot ? " · BOT" : ""}</b><small>{player.id === state.hostId ? "Comandante · ospita" : player.isBot ? "Generale virtuale · pronto" : "Pronto nella sala"}</small></div>
                  {isHost && player.id !== meId && <button aria-label={`Rimuovi ${player.name}`} onClick={() => action({ type: "kickPlayer", playerId: player.id })}>×</button>}
                </article>
              ) : (
                <article className="lobby-player empty" key={index}><span className="player-avatar">+</span><div><b>Posto libero</b><small>In attesa del codice</small></div></article>
              );
            })}
          </div>
          {isHost && state.players.length < state.settings.maxPlayers && (
            <button className="bot-fill-button" disabled={busy} onClick={() => action({ type: "fillWithBots" })}>
              <span>◆</span><b>Riempi {state.settings.maxPlayers - state.players.length} {state.settings.maxPlayers - state.players.length === 1 ? "posto" : "posti"} con i bot</b><small>Giocano turni completi con le stesse regole</small>
            </button>
          )}
        </section>
        <aside className="lobby-settings">
          <div className="panel-heading"><span>Regole della campagna</span><small>{isHost ? "Puoi modificarle" : "Scelte da chi ospita"}</small></div>
          <label className="setting-row"><span><b>Giocatori</b><small>Da 2 a 6 strateghi</small></span><select disabled={!isHost} value={state.settings.maxPlayers} onChange={(event) => update("maxPlayers", Number(event.target.value))}>{[2, 3, 4, 5, 6].map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
          <div className="setting-row fixed"><span><b>Obiettivo Challenge</b><small>Una delle 16 carte grafiche da 86 punti</small></span><span className="status-pill">UFFICIALE</span></div>
          <label className="setting-row"><span><b>Finale Challenge</b><small>Il timer parte finito lo schieramento; poi ultimo giro e sdadata</small></span><select disabled={!isHost} value={state.settings.timeLimitMinutes} onChange={(event) => update("timeLimitMinutes", Number(event.target.value))}><option value={90}>90 min · principale</option><option value={60}>60 minuti</option><option value={45}>45 minuti</option><option value={0}>Disattivato</option></select></label>
          <div className="setting-row fixed"><span><b>Difesa automatica a tre dadi</b><small>Il server lancia 3/2/1 dadi; il pareggio favorisce la difesa</small></span><span className="status-pill">ATTIVA</span></div>
          {state.settings.maxPlayers === 2 && <p className="info-note">Duello con 14 territori neutrali presidiati da 2 armate.</p>}
          {isHost ? (
            <button className="primary-button full-button" disabled={busy || state.players.length < 2} onClick={() => action({ type: "startGame" })}>{state.players.length < 2 ? "Attendi almeno un avversario" : "Distribuisci territori e carte Challenge"}</button>
          ) : <div className="waiting-host"><span className="pulse-dot" /> In attesa che inizi la partita…</div>}
        </aside>
      </div>
    </main>
  );
}

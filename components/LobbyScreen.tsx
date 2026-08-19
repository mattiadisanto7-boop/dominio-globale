"use client";

import type { CSSProperties } from "react";
import Brand from "@/components/Brand";
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
      <header className="game-topbar lobby-topbar"><Brand compact /><button className="ghost-button" onClick={onLeave}>Torna al menu</button></header>
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
                  <span className="player-avatar" style={{ "--player-color": player.color } as CSSProperties}>{player.name.slice(0, 1).toUpperCase()}</span>
                  <div><b>{player.name}</b><small>{player.id === state.hostId ? "Comandante · ospita" : "Pronto nella sala"}</small></div>
                  {isHost && player.id !== meId && <button aria-label={`Rimuovi ${player.name}`} onClick={() => action({ type: "kickPlayer", playerId: player.id })}>×</button>}
                </article>
              ) : (
                <article className="lobby-player empty" key={index}><span className="player-avatar">+</span><div><b>Posto libero</b><small>In attesa del codice</small></div></article>
              );
            })}
          </div>
        </section>
        <aside className="lobby-settings">
          <div className="panel-heading"><span>Regole della campagna</span><small>{isHost ? "Puoi modificarle" : "Scelte da chi ospita"}</small></div>
          <label className="setting-row"><span><b>Giocatori</b><small>Da 2 a 6 strateghi</small></span><select disabled={!isHost} value={state.settings.maxPlayers} onChange={(event) => update("maxPlayers", Number(event.target.value))}>{[2, 3, 4, 5, 6].map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
          <label className="setting-row"><span><b>Condizione di vittoria</b><small>Missioni private o conquista totale</small></span><select disabled={!isHost} value={state.settings.mode} onChange={(event) => update("mode", event.target.value)}><option value="missioni">Missioni segrete</option><option value="dominio">Dominio totale</option></select></label>
          <label className="setting-row"><span><b>Time attack</b><small>Vittoria ai punti allo scadere</small></span><select disabled={!isHost} value={state.settings.timeLimitMinutes} onChange={(event) => update("timeLimitMinutes", Number(event.target.value))}><option value={0}>Disattivato</option><option value={45}>45 minuti</option><option value={60}>60 minuti</option><option value={90}>90 minuti</option></select></label>
          <div className="setting-row fixed"><span><b>Difesa a tre dadi</b><small>Il pareggio favorisce la difesa</small></span><span className="status-pill">ATTIVA</span></div>
          {state.settings.maxPlayers === 2 && <p className="info-note">Duello con 14 territori neutrali presidiati da 2 armate.</p>}
          {isHost ? (
            <button className="primary-button full-button" disabled={busy || state.players.length < 2} onClick={() => action({ type: "startGame" })}>{state.players.length < 2 ? "Attendi almeno un avversario" : "Distribuisci territori e obiettivi"}</button>
          ) : <div className="waiting-host"><span className="pulse-dot" /> In attesa che inizi la partita…</div>}
        </aside>
      </div>
    </main>
  );
}

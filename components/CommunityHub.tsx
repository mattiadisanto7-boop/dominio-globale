"use client";

import type { CommunitySnapshot, PublicRoomSummary } from "@/lib/community-types";

const PHASE_LABELS: Record<PublicRoomSummary["phase"], string> = {
  lobby: "In attesa",
  setup: "Schieramento",
  reinforce: "Rinforzi",
  attack: "Battaglia",
  fortify: "Spostamento",
  gameover: "Conclusa",
};

const PRESENCE_LABELS = {
  home: "Nella lobby globale",
  playing: "In partita",
  spectating: "Sta guardando",
} as const;

export default function CommunityHub({
  snapshot,
  loading,
  profileId,
  busyCode,
  onJoin,
  onSpectate,
}: {
  snapshot?: CommunitySnapshot;
  loading: boolean;
  profileId?: string;
  busyCode?: string;
  onJoin: (code: string) => void;
  onSpectate: (code: string) => void;
}) {
  const rooms = snapshot?.rooms ?? [];
  const online = snapshot?.online ?? [];
  const leaderboard = snapshot?.leaderboard ?? [];
  const myRank = profileId ? leaderboard.findIndex((profile) => profile.id === profileId) : -1;

  return (
    <section className="community-section" aria-label="Community online">
      <div className="community-heading">
        <div><span className="eyebrow"><i /> SERVER GLOBALE</span><h2>La sala di comando è viva.</h2><p>Entra in una stanza pubblica senza codice, osserva le battaglie in corso o scala la classifica generale.</p></div>
        <div className="online-total"><i /><b>{online.length}</b><span>giocatori<br />online ora</span></div>
      </div>
      <div className="community-grid">
        <section className="public-rooms-panel">
          <header><div><span>PARTITE PUBBLICHE</span><small>Aggiornamento automatico</small></div><b>{rooms.length}</b></header>
          <div className="public-room-list">
            {loading && !snapshot && <div className="community-loading"><i /><span>Ricerca delle stanze aperte…</span></div>}
            {!loading && !rooms.length && <div className="community-empty"><span>◎</span><b>Nessuna stanza aperta</b><small>Creane una pubblica: comparirà qui per tutti.</small></div>}
            {rooms.map((room) => {
              const waiting = room.phase === "lobby";
              const full = room.players >= room.maxPlayers;
              return (
                <article className={`public-room ${waiting ? "waiting" : "live"}`} key={room.code}>
                  <div className="room-state"><i /><span>{PHASE_LABELS[room.phase]}</span></div>
                  <div className="room-identity"><b>{room.hostName}</b><small>Sala {room.code} · {room.timeLimitMinutes ? `${room.timeLimitMinutes} min` : "senza limite"}</small></div>
                  <div className="room-capacity"><b>{room.players}/{room.maxPlayers}</b><small>{room.bots ? `${room.humans} umani · ${room.bots} bot` : "giocatori"}</small></div>
                  {!waiting && <div className="room-watchers"><b>{room.spectators}</b><small>spettatori</small></div>}
                  {waiting ? (
                    <button disabled={!profileId || full || busyCode === room.code} onClick={() => onJoin(room.code)}>
                      {busyCode === room.code ? "Ingresso…" : full ? "Completa" : "Entra"}
                    </button>
                  ) : (
                    <button className="watch-button" disabled={!profileId || busyCode === room.code} onClick={() => onSpectate(room.code)}>
                      {busyCode === room.code ? "Apertura…" : "Guarda"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {!profileId && <p className="community-auth-note">Registrati o accedi per entrare e guardare le partite.</p>}
        </section>

        <aside className="online-panel">
          <header><span>GIOCATORI ONLINE</span><b>{online.length}</b></header>
          <div>
            {online.slice(0, 14).map((player) => (
              <article key={player.id} className={player.id === profileId ? "me" : ""}>
                <span className="online-avatar">{player.nickname.slice(0, 1).toUpperCase()}<i /></span>
                <div><b>{player.nickname}{player.id === profileId ? " · tu" : ""}</b><small>{PRESENCE_LABELS[player.presence]}</small></div>
                <em>{player.rating}</em>
              </article>
            ))}
            {!online.length && <div className="online-empty">Il prossimo comandante online potresti essere tu.</div>}
          </div>
        </aside>
      </div>

      <section className="leaderboard-panel">
        <header><div><span>CLASSIFICA GLOBALE</span><small>Rating, vittorie e statistiche di tutte le campagne registrate</small></div>{myRank >= 0 && <b>LA TUA POSIZIONE · #{myRank + 1}</b>}</header>
        <div className="leaderboard-scroll">
          <table>
            <thead><tr><th>#</th><th>Comandante</th><th>Rating</th><th>Partite</th><th>Vittorie</th><th>% vittorie</th><th>Conquiste</th><th>Armate eliminate</th><th>Miglior obiettivo</th></tr></thead>
            <tbody>
              {leaderboard.slice(0, 20).map((player, index) => (
                <tr key={player.id} className={player.id === profileId ? "me" : ""}>
                  <td><b className={`rank-badge rank-${index + 1}`}>{index + 1}</b></td>
                  <td><span className="leader-name"><i>{player.nickname.slice(0, 1).toUpperCase()}</i><b>{player.nickname}</b></span></td>
                  <td><strong>{player.rating}</strong></td>
                  <td>{player.gamesPlayed}</td>
                  <td>{player.wins}</td>
                  <td>{player.gamesPlayed ? Math.round((player.wins / player.gamesPlayed) * 100) : 0}%</td>
                  <td>{player.territoriesConquered}</td>
                  <td>{player.armiesDefeated}</td>
                  <td>{player.bestObjectiveScore}/86</td>
                </tr>
              ))}
              {!leaderboard.length && <tr><td colSpan={9} className="leaderboard-empty">La prima partita classificata inaugurerà la graduatoria.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

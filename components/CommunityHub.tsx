"use client";

import type { CommunitySnapshot, FriendActionIntent, FriendsSnapshot, PublicRoomSummary } from "@/lib/community-types";

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
  friends,
  friendBusy,
  friendError,
  onFriendAction,
  onJoin,
  onSpectate,
}: {
  snapshot?: CommunitySnapshot;
  loading: boolean;
  profileId?: string;
  busyCode?: string;
  friends?: FriendsSnapshot;
  friendBusy?: string;
  friendError?: string;
  onFriendAction: (profileId: string, intent: FriendActionIntent) => void;
  onJoin: (code: string) => void;
  onSpectate: (code: string) => void;
}) {
  const rooms = snapshot?.rooms ?? [];
  const online = snapshot?.online ?? [];
  const leaderboard = snapshot?.leaderboard ?? [];
  const myRank = profileId ? leaderboard.findIndex((profile) => profile.id === profileId) : -1;
  const friendIds = new Set(friends?.friends.map((profile) => profile.id) ?? []);
  const incomingIds = new Set(friends?.incoming.map((profile) => profile.id) ?? []);
  const outgoingIds = new Set(friends?.outgoing.map((profile) => profile.id) ?? []);

  const friendControl = (targetId: string) => {
    if (!profileId || targetId === profileId) return null;
    if (friendIds.has(targetId)) return <span className="friend-status accepted">✓ Amico</span>;
    if (outgoingIds.has(targetId)) return <span className="friend-status pending">Richiesta inviata</span>;
    if (incomingIds.has(targetId)) return <button className="friend-action accept" disabled={friendBusy === targetId} onClick={() => onFriendAction(targetId, "accept")}>{friendBusy === targetId ? "…" : "Accetta"}</button>;
    return <button className="friend-action" disabled={friendBusy === targetId} onClick={() => onFriendAction(targetId, "request")}>{friendBusy === targetId ? "…" : "+ Amico"}</button>;
  };

  return (
    <section className="community-section" aria-label="Community online">
      <div className="community-heading">
        <div><span className="eyebrow"><i /> SERVER GLOBALE</span><h2>La sala di comando è viva.</h2><p>Entra in una stanza pubblica senza codice, osserva le battaglie, crea la tua rete di amici o scala la classifica generale.</p></div>
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

        <div className="community-side-stack">
          <aside className="online-panel">
            <header><span>GIOCATORI ONLINE</span><b>{online.length}</b></header>
            <div>
              {online.slice(0, 14).map((player) => (
                <article key={player.id} className={player.id === profileId ? "me" : ""}>
                  <span className="online-avatar">{player.nickname.slice(0, 1).toUpperCase()}<i /></span>
                  <div><b>{player.nickname}{player.id === profileId ? " · tu" : ""}</b><small>{PRESENCE_LABELS[player.presence]}</small></div>
                  <span className="online-actions"><em>{player.rating} PD</em>{friendControl(player.id)}</span>
                </article>
              ))}
              {!online.length && <div className="online-empty">Il prossimo comandante online potresti essere tu.</div>}
            </div>
          </aside>

          {profileId && <aside className="friends-panel">
            <header><span>RETE ALLEATI</span><b className={friends?.incoming.length ? "has-requests" : ""}>{friends?.incoming.length ? `${friends.incoming.length} nuove` : friends?.friends.length ?? 0}</b></header>
            <div className="friends-list">
              {friends?.incoming.map((player) => <article key={`in-${player.id}`} className="friend-request-row"><span className="friend-avatar">{player.nickname.slice(0, 1).toUpperCase()}</span><div><b>{player.nickname}</b><small>Vuole diventare tuo amico</small></div><span className="friend-row-actions"><button disabled={friendBusy === player.id} onClick={() => onFriendAction(player.id, "accept")}>✓</button><button className="reject" disabled={friendBusy === player.id} onClick={() => onFriendAction(player.id, "reject")}>×</button></span></article>)}
              {friends?.friends.map((player) => <article key={`friend-${player.id}`}><span className="friend-avatar allied">✓</span><div><b>{player.nickname}</b><small>{player.rating} PD · alleato</small></div><button className="friend-remove" disabled={friendBusy === player.id} onClick={() => onFriendAction(player.id, "remove")}>Rimuovi</button></article>)}
              {friends?.outgoing.map((player) => <article key={`out-${player.id}`}><span className="friend-avatar pending">⌛</span><div><b>{player.nickname}</b><small>Richiesta in attesa</small></div><button className="friend-remove" disabled={friendBusy === player.id} onClick={() => onFriendAction(player.id, "cancel")}>Annulla</button></article>)}
              {friends && !friends.incoming.length && !friends.friends.length && !friends.outgoing.length && <div className="friends-empty"><span>♙</span><b>Crea la tua alleanza</b><small>Invia una richiesta dai giocatori online o dalla classifica.</small></div>}
              {!friends && <div className="friends-empty"><i /><small>Sincronizzazione alleati…</small></div>}
            </div>
            {friendError && <p className="friend-error" role="alert">{friendError}</p>}
          </aside>}
        </div>
      </div>

      <section className="leaderboard-panel">
        <header><div><span>CLASSIFICA GLOBALE</span><small>Punti Dominio cumulativi da 0: premiano vittorie, obiettivi e risultati sul campo</small></div>{myRank >= 0 && <b>LA TUA POSIZIONE · #{myRank + 1}</b>}</header>
        <div className="dominion-score-key"><span><b>Base 100</b> vincitore</span><span><b>Base 20</b> altri giocatori</span><span><b>+1</b> per punto obiettivo</span><span><b>+2</b> per conquista</span><span><b>+1</b> ogni 3 armate eliminate</span><span><b>+3</b> per tris</span></div>
        <div className="leaderboard-scroll">
          <table>
            <thead><tr><th>#</th><th>Comandante</th><th>Punti Dominio</th><th>Partite</th><th>Vittorie</th><th>% vittorie</th><th>Conquiste</th><th>Armate eliminate</th><th>Miglior obiettivo</th><th>Relazione</th></tr></thead>
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
                  <td>{friendControl(player.id)}</td>
                </tr>
              ))}
              {!leaderboard.length && <tr><td colSpan={10} className="leaderboard-empty">La prima partita classificata inaugurerà la graduatoria.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import ObjectiveCard from "@/components/ObjectiveCard";
import { TERRITORIES } from "@/lib/game-data";
import { dominionPointsForPerformance } from "@/lib/scoring";
import type { PublicGameState } from "@/lib/game-types";

export default function MatchSummary({ state, delayForAnimations }: { state: PublicGameState; delayForAnimations: boolean }) {
  const recentConquest = Boolean(
    delayForAnimations &&
    state.lastBattle?.conquered &&
    (!state.lastSuddenDeath?.closed || state.lastBattle.at > state.lastSuddenDeath.at),
  );
  const completedContinent = Boolean(recentConquest && state.lastContinentConquest?.at === state.lastBattle?.at);
  const revealDelay = completedContinent ? 7100 : recentConquest ? 3350 : 450;
  const [ready, setReady] = useState(!recentConquest);
  const [open, setOpen] = useState(!recentConquest);
  const [objectivePlayerId, setObjectivePlayerId] = useState(state.winnerId ?? state.players[0]?.id);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => { setReady(true); setOpen(true); }, revealDelay);
    return () => window.clearTimeout(timer);
  }, [ready, revealDelay]);
  const standings = useMemo(() => state.players.map((player) => {
    const objectiveIds = new Set(player.objective?.territoryIds ?? []);
    const owned = TERRITORIES.filter((territory) => state.territories[territory.id].ownerId === player.id);
    const secured = owned.filter((territory) => objectiveIds.has(territory.id));
    const outside = owned.filter((territory) => !objectiveIds.has(territory.id));
    const objectiveScore = secured.reduce((sum, territory) => sum + territory.value, 0);
    const outsideScore = outside.reduce((sum, territory) => sum + territory.value, 0);
    const targetArmies = secured.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
    const outsideArmies = outside.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
    const armies = owned.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
    const won = player.id === state.winnerId;
    return {
      player,
      objectiveScore,
      outsideScore,
      targetArmies,
      outsideArmies,
      territories: owned.length,
      armies,
      dominionPoints: dominionPointsForPerformance({ won, abandoned: player.abandoned, objectiveScore, stats: player.stats }),
      won,
    };
  }).sort((left, right) =>
    Number(right.won) - Number(left.won) ||
    right.objectiveScore - left.objectiveScore ||
    right.outsideScore - left.outsideScore ||
    right.targetArmies - left.targetArmies ||
    right.outsideArmies - left.outsideArmies ||
    right.player.cardCount - left.player.cardCount,
  ), [state]);
  const objectivePlayer = state.players.find((player) => player.id === objectivePlayerId) ?? standings[0]?.player;

  if (!ready) return null;
  if (!open) return <button className="match-summary-trigger" onClick={() => setOpen(true)}><span>🏆</span><b>Risultati finali</b><small>Classifica, statistiche e obiettivi</small></button>;

  return (
    <div className="modal-backdrop match-summary-backdrop" role="dialog" aria-modal="true" aria-label="Risultati finali della partita">
      <section className="match-summary-modal">
        <header>
          <div><span className="eyebrow"><i /> CAMPAGNA CONCLUSA</span><h2>Rapporto finale</h2><p>{state.victoryReason}</p></div>
          <button onClick={() => setOpen(false)} aria-label="Riduci i risultati">×</button>
        </header>
        <div className="match-podium">
          {standings.slice(0, 3).map((standing, index) => <article key={standing.player.id} className={`podium-${index + 1}`} style={{ "--player-color": standing.player.color } as React.CSSProperties}><span>{index === 0 ? "♛" : index + 1}</span><b>{standing.player.name}</b><small>{standing.objectiveScore}/86 punti obiettivo</small><em>+{standing.dominionPoints} PD</em></article>)}
        </div>
        <div className="match-results-grid">
          <div className="match-ranking-scroll">
            <table>
              <thead><tr><th>#</th><th>Comandante</th><th>Punti</th><th>Territori</th><th>Armate</th><th>Attacchi</th><th>Conquiste</th><th>Armate eliminate</th><th>Perdite</th><th>Tris</th><th>Obiettivo</th></tr></thead>
              <tbody>{standings.map((standing, index) => (
                <tr key={standing.player.id} className={standing.won ? "winner" : ""}>
                  <td><b>{index + 1}</b></td>
                  <td><span className="match-player"><i style={{ background: standing.player.color }} />{standing.player.name}{standing.player.isBot ? " · BOT" : ""}</span></td>
                  <td><strong>{standing.objectiveScore}<small>/86</small></strong><em>+{standing.dominionPoints} PD</em></td>
                  <td>{standing.territories}</td><td>{standing.armies}</td><td>{standing.player.stats.attacks}</td><td>{standing.player.stats.territoriesConquered}</td><td>{standing.player.stats.armiesDefeated}</td><td>{standing.player.stats.armiesLost}</td><td>{standing.player.stats.setsTraded}</td>
                  <td><button onClick={() => setObjectivePlayerId(standing.player.id)}>Vedi carta</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {objectivePlayer?.objective && <aside className="final-objective-view"><header><span>OBIETTIVO DI</span><b>{objectivePlayer.name}</b></header><ObjectiveCard state={state} player={objectivePlayer} /></aside>}
        </div>
        <footer><span><b>PD</b> = Punti Dominio guadagnati in questa partita.</span><button className="secondary-button" onClick={() => setOpen(false)}>Torna al tabellone</button></footer>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { TERRITORY_BY_ID } from "@/lib/game-data";
import type { PublicGameState } from "@/lib/game-types";

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function PipDie({ value, tone, rolling = false, delay = 0 }: { value: number; tone: "attack" | "defense"; rolling?: boolean; delay?: number }) {
  const active = new Set(PIPS[value] ?? []);
  return (
    <span className={`pip-die ${tone} ${rolling ? "rolling" : ""}`} style={{ "--die-delay": `${delay}ms` } as React.CSSProperties} aria-label={`${value}`}>
      {Array.from({ length: 9 }, (_, index) => <i key={index} className={active.has(index) ? "on" : ""} />)}
    </span>
  );
}

export function GraphicDiceRow({ values, tone, rolling = false }: { values: number[]; tone: "attack" | "defense"; rolling?: boolean }) {
  return <div className={`graphic-dice-row ${tone}`}>{values.map((value, index) => <PipDie key={`${value}-${index}`} value={value} tone={tone} rolling={rolling} delay={index * 90} />)}</div>;
}

export default function DiceArena({ state }: { state: PublicGameState }) {
  const initialBattle = useRef(state.pendingBattle?.createdAt);
  const initialReport = useRef(state.lastBattle?.at);
  const [visible, setVisible] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    const battleAt = state.pendingBattle?.createdAt;
    const reportAt = state.lastBattle?.at;
    const changed = (battleAt && battleAt !== initialBattle.current) || (reportAt && reportAt !== initialReport.current);
    initialBattle.current = battleAt;
    initialReport.current = reportAt;
    if (!changed) return;
    setVisible(true);
    setRolling(true);
    const settle = window.setTimeout(() => setRolling(false), 780);
    const close = reportAt ? window.setTimeout(() => setVisible(false), 3300) : undefined;
    return () => {
      window.clearTimeout(settle);
      if (close) window.clearTimeout(close);
    };
  }, [state.lastBattle?.at, state.pendingBattle?.createdAt]);

  const report = state.lastBattle;
  const battle = state.pendingBattle;
  if (!visible || (!report && !battle)) return null;
  const from = TERRITORY_BY_ID[(report ?? battle)!.from];
  const to = TERRITORY_BY_ID[(report ?? battle)!.to];
  const attackDice = report?.attackerDice ?? battle?.attackerDice ?? [];

  return (
    <div className={`dice-arena ${rolling ? "is-rolling" : "is-settled"}`} aria-live="polite">
      <div className="dice-arena-glow" />
      <div className="dice-route"><span>{from.name}</span><b>⚔</b><span>{to.name}</span></div>
      <div className="dice-combatants">
        <section>
          <small>ATTACCO</small>
          <GraphicDiceRow values={attackDice} tone="attack" rolling={rolling} />
        </section>
        <div className="dice-versus">VS</div>
        <section>
          <small>DIFESA</small>
          {report ? <GraphicDiceRow values={report.defenderDice} tone="defense" rolling={rolling} /> : <div className="defense-pending"><i /><i /><i /></div>}
        </section>
      </div>
      {!rolling && report && (
        <div className={`battle-result ${report.conquered ? "conquered" : ""}`}>
          <b>{report.conquered ? `${to.name} conquistato!` : "Scontro risolto"}</b>
          <span>Attacco −{report.attackerLosses} · Difesa −{report.defenderLosses}</span>
        </div>
      )}
      {!report && <p className="dice-waiting">In attesa del lancio di difesa…</p>}
    </div>
  );
}

import { attackDiceForArmies, canAttackMatchup, defenseDiceForArmies } from "../lib/game-data.ts";

const attackCases = new Map([[0, 0], [1, 0], [2, 1], [3, 2], [4, 3], [20, 3]]);
const defenseCases = new Map([[0, 0], [1, 1], [2, 2], [3, 3], [20, 3]]);

for (const [armies, expected] of attackCases) {
  const actual = attackDiceForArmies(armies);
  if (actual !== expected) throw new Error(`Attacco con ${armies} armate: attesi ${expected} dadi, ottenuti ${actual}.`);
}

for (const [armies, expected] of defenseCases) {
  const actual = defenseDiceForArmies(armies);
  if (actual !== expected) throw new Error(`Difesa con ${armies} armate: attesi ${expected} dadi, ottenuti ${actual}.`);
}

const matchupCases = [
  [2, 1, true],
  [2, 2, false],
  [2, 8, false],
  [3, 1, true],
  [3, 2, true],
  [3, 3, false],
  [3, 9, false],
  [4, 1, true],
  [4, 12, true],
];

for (const [attacker, defender, expected] of matchupCases) {
  const actual = canAttackMatchup(attacker, defender);
  if (actual !== expected) throw new Error(`Attacco ${attacker} contro ${defender}: atteso ${expected}, ottenuto ${actual}.`);
}

console.log("OK · dadi automatici 3/2/1 e blocco preventivo 2→2+, 3→3+");

import { attackDiceForArmies, defenseDiceForArmies } from "../lib/game-data.ts";

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

console.log("OK · dadi automatici: attacco 3/2/1 con 4+/3/2 armate, difesa 3/2/1 con 3+/2/1 armate");

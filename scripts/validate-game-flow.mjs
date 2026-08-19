import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const context = vm.createContext({
  console,
  crypto: globalThis.crypto,
  structuredClone: globalThis.structuredClone,
  setTimeout,
  clearTimeout,
});
const modules = new Map();

const resolveModule = (specifier, parent) => {
  if (specifier.startsWith("@/")) return path.join(root, `${specifier.slice(2)}.ts`);
  if (specifier.startsWith(".")) return path.resolve(path.dirname(parent), specifier.replace(/\.js$/, ".ts"));
  throw new Error(`Import non gestito nel test: ${specifier}`);
};

const loadModule = async (filename) => {
  if (modules.has(filename)) return modules.get(filename);
  const source = await fs.readFile(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const sourceModule = new vm.SourceTextModule(transpiled, { context, identifier: pathToFileURL(filename).href });
  modules.set(filename, sourceModule);
  await sourceModule.link((specifier, referencingModule) =>
    loadModule(resolveModule(specifier, new URL(referencingModule.identifier).pathname)),
  );
  await sourceModule.evaluate();
  return sourceModule;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const engine = (await loadModule(path.join(root, "lib/game-engine.ts"))).namespace;
const gameData = (await loadModule(path.join(root, "lib/game-data.ts"))).namespace;
const { createLobby, addLobbyPlayer, applyGameAction, sanitizeState } = engine;
const { TERRITORIES, attackDiceForArmies, defenseDiceForArmies } = gameData;

const settings = { maxPlayers: 2, mode: "missioni", timeLimitMinutes: 0, defense: "automatic" };
let state = createLobby("TEST42", { id: "alpha", name: "Alpha" }, settings);
addLobbyPlayer(state, { id: "bravo", name: "Bravo" });
state = applyGameAction(state, "alpha", { type: "startGame" });

assert(state.phase === "setup", "La partita deve iniziare dallo schieramento.");
assert(Boolean(state.currentPlayerId), "Lo schieramento deve avere un giocatore corrente.");

const firstSetupId = state.currentPlayerId;
const firstSetupPlayer = state.players.find((player) => player.id === firstSetupId);
const firstSetupPool = firstSetupPlayer.setupPool;
state = applyGameAction(state, firstSetupId, { type: "autoSetup" });
assert(firstSetupPlayer.setupPool === firstSetupPool, "Le azioni devono preservare lo stato originale.");
assert(state.players.find((player) => player.id === firstSetupId).setupPool === firstSetupPool - 3, "Anche la distribuzione rapida deve piazzare un solo blocco di 3.");
assert(state.currentPlayerId !== firstSetupId, "La distribuzione rapida deve passare il comando al giocatore successivo.");

let setupActions = 1;
while (state.phase === "setup") {
  const actorId = state.currentPlayerId;
  const actor = state.players.find((player) => player.id === actorId);
  const territory = TERRITORIES.find((item) => state.territories[item.id].ownerId === actorId);
  const beforePool = actor.setupPool;
  const beforeArmies = state.territories[territory.id].armies;
  const expected = Math.min(3, beforePool);
  state = applyGameAction(state, actorId, { type: "placeSetup", territoryId: territory.id });
  assert(state.territories[territory.id].armies === beforeArmies + expected, "Ogni blocco iniziale deve contenere 3 armate, salvo il resto finale.");
  if (state.phase === "setup") assert(state.currentPlayerId !== actorId, "Dopo ogni blocco iniziale deve cambiare giocatore.");
  setupActions += 1;
  assert(setupActions < 100, "Lo schieramento alternato non termina.");
}

assert(state.phase === "reinforce", "Dopo lo schieramento deve iniziare la fase rinforzi.");
const attackerId = state.currentPlayerId;
const attacker = state.players.find((player) => player.id === attackerId);
const attackFrom = TERRITORIES.find((territory) =>
  state.territories[territory.id].ownerId === attackerId &&
  territory.adjacent.some((id) => state.territories[id].ownerId !== attackerId),
);
const attackToId = attackFrom.adjacent.find((id) => state.territories[id].ownerId !== attackerId);
const reinforcementPool = state.reinforcementPool;
state = applyGameAction(state, attackerId, { type: "deploy", territoryId: attackFrom.id, amount: reinforcementPool });
assert(state.phase === "attack", "L'ultima armata di rinforzo deve aprire automaticamente gli attacchi.");

state.territories[attackFrom.id].armies = 4;
state.territories[attackToId].armies = 3;
state = applyGameAction(state, attackerId, { type: "attack", from: attackFrom.id, to: attackToId });
assert(!state.pendingBattle, "La difesa non deve restare in attesa di un clic.");
assert(state.lastBattle?.attackerDice.length === attackDiceForArmies(4), "I dadi d'attacco automatici non rispettano la regola 3/2/1.");
assert(state.lastBattle?.defenderDice.length === defenseDiceForArmies(3), "I dadi di difesa automatici non rispettano la regola 3/2/1.");

state.pendingMove = undefined;
state.phase = "fortify";
state.currentPlayerId = attackerId;
state.turnIndex = state.turnOrder.indexOf(attackerId);
state.conqueredThisTurn = true;
const beforeCards = attacker.cards.length;
state = applyGameAction(state, attackerId, { type: "endTurn" });
const drawer = state.players.find((player) => player.id === attackerId);
assert(drawer.cards.length === beforeCards + 1, "La conquista deve assegnare una carta.");
assert(Boolean(drawer.lastDrawnCard), "La carta appena pescata deve essere ricordata.");
const privateView = sanitizeState(state, attackerId).players.find((player) => player.id === attackerId);
const opponentView = sanitizeState(state, state.currentPlayerId).players.find((player) => player.id === attackerId);
assert(privateView.lastDrawnCard?.id === drawer.lastDrawnCard.id, "Chi pesca deve vedere la propria ultima carta anche nel turno seguente.");
assert(!opponentView.lastDrawnCard, "L'ultima carta pescata non deve essere rivelata agli avversari.");

console.log(`OK · ${setupActions} blocchi alternati · attacco/difesa automatici · carta pescata privata`);

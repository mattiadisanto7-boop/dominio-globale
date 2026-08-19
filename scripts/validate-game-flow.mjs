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

const assertRuleError = (operation, message) => {
  try {
    operation();
  } catch (error) {
    if (error?.name === "GameRuleError") return;
    throw error;
  }
  throw new Error(message);
};

const engine = (await loadModule(path.join(root, "lib/game-engine.ts"))).namespace;
const gameData = (await loadModule(path.join(root, "lib/game-data.ts"))).namespace;
const { createLobby, addLobbyPlayer, applyGameAction, removeLobbyPlayer, sanitizeState } = engine;
const { TERRITORIES, attackDiceForArmies, defenseDiceForArmies } = gameData;

const settings = { maxPlayers: 2, mode: "missioni", timeLimitMinutes: 90, defense: "automatic", visibility: "public" };
let leavingLobby = createLobby("LEAVE1", { id: "host_leave", name: "Host", profileId: "profile_host" }, { ...settings, maxPlayers: 3 });
addLobbyPlayer(leavingLobby, { id: "guest_leave", name: "Guest", profileId: "profile_guest" });
addLobbyPlayer(leavingLobby, { id: "next_host", name: "Next", profileId: "profile_next" });
leavingLobby = removeLobbyPlayer(leavingLobby, "guest_leave");
assert(!leavingLobby.players.some((player) => player.id === "guest_leave") && leavingLobby.players.length === 2, "Chi esce dalla lobby deve liberare immediatamente il posto.");
leavingLobby = removeLobbyPlayer(leavingLobby, "host_leave");
assert(leavingLobby.hostId === "next_host" && leavingLobby.players.length === 1, "Se esce l'host, il comando deve passare al prossimo giocatore umano.");

let state = createLobby("TEST42", { id: "alpha", name: "Alpha", profileId: "profile_alpha" }, settings);
addLobbyPlayer(state, { id: "bravo", name: "Bravo", profileId: "profile_bravo" });
state = applyGameAction(state, "alpha", { type: "startGame" });

assert(state.phase === "setup", "La partita deve iniziare dallo schieramento.");
assert(Boolean(state.matchId), "Ogni nuova partita deve avere un identificatore univoco per le statistiche.");
assert(Boolean(state.currentPlayerId), "Lo schieramento deve avere un giocatore corrente.");
assert(!state.startedAt && !state.deadlineAt, "Il timer non deve partire prima dello schieramento iniziale completo.");
const legacySetup = structuredClone(state);
legacySetup.currentPlayerId = undefined;
assert(Boolean(sanitizeState(legacySetup, "alpha").currentPlayerId), "Le partite create prima dello schieramento alternato devono essere recuperate automaticamente.");

const firstSetupId = state.currentPlayerId;
const firstSetupPlayer = state.players.find((player) => player.id === firstSetupId);
const firstSetupPool = firstSetupPlayer.setupPool;
const splitTargets = TERRITORIES.filter((territory) => state.territories[territory.id].ownerId === firstSetupId).slice(0, 3);
for (let index = 0; index < 3; index += 1) {
  const target = splitTargets[index];
  const before = state.territories[target.id].armies;
  state = applyGameAction(state, firstSetupId, { type: "placeSetup", territoryId: target.id });
  assert(state.territories[target.id].armies === before + 1, "Ogni clic iniziale deve piazzare esattamente 1 armata.");
  if (index < 2) {
    assert(state.currentPlayerId === firstSetupId, "Il comando deve restare allo stesso giocatore fino al terzo piazzamento.");
    assert(state.setupBatchRemaining === 2 - index, "Il contatore del blocco iniziale non è corretto.");
  }
}
assert(firstSetupPlayer.setupPool === firstSetupPool, "Le azioni devono preservare lo stato originale.");
assert(state.players.find((player) => player.id === firstSetupId).setupPool === firstSetupPool - 3, "Tre territori differenti devono ricevere una delle tre armate iniziali.");
assert(state.currentPlayerId !== firstSetupId, "Dopo il terzo piazzamento deve cambiare giocatore.");

const autoSetupId = state.currentPlayerId;
const autoSetupPool = state.players.find((player) => player.id === autoSetupId).setupPool;
state = applyGameAction(state, autoSetupId, { type: "autoSetup" });
assert(state.players.find((player) => player.id === autoSetupId).setupPool === autoSetupPool - 3, "La distribuzione rapida deve completare i piazzamenti rimasti nel blocco.");

let setupActions = 4;
while (state.phase === "setup") {
  const actorId = state.currentPlayerId;
  const actor = state.players.find((player) => player.id === actorId);
  const beforePool = actor.setupPool;
  const expected = Math.min(state.setupBatchRemaining, beforePool);
  state = applyGameAction(state, actorId, { type: "autoSetup" });
  assert(state.players.find((player) => player.id === actorId).setupPool === beforePool - expected, "La distribuzione automatica deve completare solo il blocco corrente.");
  if (state.phase === "setup") assert(state.currentPlayerId !== actorId, "Dopo ogni blocco iniziale deve cambiare giocatore.");
  setupActions += 1;
  assert(setupActions < 100, "Lo schieramento alternato non termina.");
}

assert(state.phase === "reinforce", "Dopo lo schieramento deve iniziare la fase rinforzi.");
assert(Boolean(state.startedAt && state.deadlineAt), "Il timer deve partire quando tutte le armate iniziali sono state piazzate.");
assert(Math.abs(state.deadlineAt - state.startedAt - 90 * 60_000) < 10, "Il timer principale deve durare 90 minuti dal termine dello schieramento.");
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

state.territories[attackFrom.id].armies = 2;
state.territories[attackToId].armies = 2;
assertRuleError(
  () => applyGameAction(state, attackerId, { type: "attack", from: attackFrom.id, to: attackToId }),
  "Un territorio con 2 armate non deve poter attaccarne uno con 2 o più.",
);
state.territories[attackFrom.id].armies = 3;
state.territories[attackToId].armies = 3;
assertRuleError(
  () => applyGameAction(state, attackerId, { type: "attack", from: attackFrom.id, to: attackToId }),
  "Un territorio con 3 armate non deve poter attaccarne uno con 3 o più.",
);
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
const spectatorView = sanitizeState(state, "__spectator__");
assert(privateView.lastDrawnCard?.id === drawer.lastDrawnCard.id, "Chi pesca deve vedere la propria ultima carta anche nel turno seguente.");
assert(privateView.cards.length === drawer.cards.length, "Il proprietario deve poter consultare tutte le proprie carte in ogni turno.");
assert(!opponentView.lastDrawnCard, "L'ultima carta pescata non deve essere rivelata agli avversari.");
assert(opponentView.cards.length === 0, "Il contenuto del mazzo deve restare segreto agli avversari.");
assert(spectatorView.players.every((player) => player.cards.length === 0 && !player.objective && !player.lastDrawnCard), "La vista spettatore non deve contenere carte, pescate o obiettivi privati.");
assert(spectatorView.players.every((player) => !("profileId" in player)), "Gli identificatori interni dei profili non devono essere inviati ai client.");

const garrison = structuredClone(state);
const garrisonPlayerId = garrison.currentPlayerId;
const garrisonEnemyId = garrison.players.find((player) => player.id !== garrisonPlayerId).id;
garrison.phase = "fortify";
garrison.reinforcementPool = 0;
garrison.fortifyUsed = false;
garrison.currentPlayerId = garrisonPlayerId;
garrison.turnIndex = garrison.turnOrder.indexOf(garrisonPlayerId);
garrison.territories.ukraine = { ownerId: garrisonPlayerId, armies: 5 };
garrison.territories.scandinavia = { ownerId: garrisonPlayerId, armies: 2 };
garrison.territories["middle-east"] = { ownerId: garrisonEnemyId, armies: 2 };
assertRuleError(
  () => applyGameAction(garrison, garrisonPlayerId, { type: "fortify", from: "ukraine", to: "scandinavia", amount: 4 }),
  "Non deve essere possibile lasciare una sola armata su un confine nemico.",
);
const legalGarrison = applyGameAction(garrison, garrisonPlayerId, { type: "fortify", from: "ukraine", to: "scandinavia", amount: 3 });
assert(legalGarrison.territories.ukraine.armies === 2, "Lo spostamento deve consentire il presidio minimo di 2 armate.");

let continentGame = structuredClone(state);
const continentAttackerId = continentGame.currentPlayerId;
const continentDefenderId = continentGame.players.find((player) => player.id !== continentAttackerId).id;
continentGame.phase = "attack";
continentGame.pendingMove = undefined;
continentGame.pendingBattle = undefined;
continentGame.territories.siam = { ownerId: continentAttackerId, armies: 80 };
continentGame.territories.indonesia = { ownerId: continentDefenderId, armies: 1 };
continentGame.territories["new-guinea"] = { ownerId: continentAttackerId, armies: 2 };
continentGame.territories["western-australia"] = { ownerId: continentAttackerId, armies: 2 };
continentGame.territories["eastern-australia"] = { ownerId: continentAttackerId, armies: 2 };
for (let attempt = 0; attempt < 80 && !continentGame.pendingMove; attempt += 1) {
  continentGame = applyGameAction(continentGame, continentAttackerId, { type: "attack", from: "siam", to: "indonesia" });
}
assert(continentGame.pendingMove, "Il test di conquista continentale non ha conquistato l'Indonesia.");
assert(continentGame.lastContinentConquest?.continent === "oceania", "La conquista dell'Oceania deve generare l'evento celebrativo.");
assert(
  continentGame.territories.siam.armies - continentGame.pendingMove.max >= continentGame.pendingMove.sourceMinimum || continentGame.pendingMove.forcedException,
  "L'occupazione deve conservare il presidio richiesto, salvo spostamento minimo obbligatorio.",
);

let timed = structuredClone(state);
timed.deadlineAt = Date.now() - 1_000;
timed.timedEndgame = { stage: "running", threshold: 4, turnsAtThreshold: 0 };
timed.turnIndex = 0;
timed.currentPlayerId = timed.turnOrder[0];
timed.phase = "fortify";
timed.fortifyUsed = false;
timed.conqueredThisTurn = false;
timed.territoriesConqueredThisTurn = 0;
timed = applyGameAction(timed, timed.currentPlayerId, { type: "endTurn" });
assert(timed.timedEndgame.stage === "penultimate", "Allo scadere deve terminare il giro in corso.");
timed.phase = "fortify";
timed = applyGameAction(timed, timed.currentPlayerId, { type: "endTurn" });
assert(timed.timedEndgame.stage === "last-round", "Dopo il giro corrente deve iniziare l'ultimo giro.");
timed.phase = "fortify";
timed = applyGameAction(timed, timed.currentPlayerId, { type: "endTurn" });
assert(timed.timedEndgame.stage === "last-round", "La sdadata non deve partire prima della fine dell'ultimo giro.");
timed.phase = "fortify";
timed.territoriesConqueredThisTurn = 3;
timed = applyGameAction(timed, timed.currentPlayerId, { type: "endTurn" });
assert(timed.timedEndgame.stage === "sudden-death", "Alla fine dell'ultimo giro deve iniziare la sdadata.");
assert(timed.lastSuddenDeath?.skipped && !timed.lastSuddenDeath.dice, "Con 3 conquiste il lancio della sdadata deve essere saltato.");
timed.phase = "fortify";
timed.territoriesConqueredThisTurn = 3;
timed = applyGameAction(timed, timed.currentPlayerId, { type: "endTurn" });
assert(timed.timedEndgame.threshold === 5, "Dopo un giro completo la soglia della sdadata deve salire da 4 a 5.");

const finished = structuredClone(state);
finished.phase = "gameover";
finished.winnerId = "alpha";
finished.players.find((player) => player.id === "bravo").status = "eliminated";
const finishedSpectator = sanitizeState(finished, "__spectator__");
assert(finishedSpectator.players.every((player) => player.cards.length === 0 && !player.objective), "Anche a partita conclusa la vista spettatore deve restare priva di informazioni private.");
const rematch = applyGameAction(finished, "alpha", { type: "rematch" });
assert(rematch.phase === "setup" && rematch.players.every((player) => player.status === "active"), "La rivincita deve riammettere anche i giocatori eliminati.");
assert(rematch.matchId !== finished.matchId, "La rivincita deve avere un nuovo identificatore statistico.");

let botGame = createLobby("BOT004", { id: "human_a", name: "Human A", profileId: "profile_human_a" }, {
  maxPlayers: 4,
  mode: "missioni",
  timeLimitMinutes: 0,
  defense: "automatic",
});
addLobbyPlayer(botGame, { id: "human_b", name: "Human B", profileId: "profile_human_b" });
botGame = applyGameAction(botGame, "human_a", { type: "fillWithBots" });
assert(botGame.players.length === 4, "Il riempimento deve occupare tutti i posti scelti nella modalità.");
assert(botGame.players.filter((player) => player.isBot).length === 2, "Una sala da 4 con 2 persone deve ricevere 2 bot.");
botGame = applyGameAction(botGame, "human_a", { type: "startGame" });
const humanBTerritories = TERRITORIES.filter((territory) => botGame.territories[territory.id].ownerId === "human_b").length;
const substitutedGame = applyGameAction(botGame, "human_b", { type: "resign" });
const replacement = substitutedGame.players.find((player) => player.id === "human_b");
assert(replacement.isBot && replacement.abandoned && replacement.status === "active", "Chi abbandona deve essere sostituito da un bot attivo.");
assert(!replacement.profileId && replacement.abandonedProfileId === "profile_human_b", "Il bot sostitutivo non deve poter essere ripreso tramite la vecchia sessione.");
assert(TERRITORIES.filter((territory) => substitutedGame.territories[territory.id].ownerId === "human_b").length === humanBTerritories, "Il bot sostitutivo deve ereditare territori e armate del giocatore.");
assert(!("abandonedProfileId" in sanitizeState(substitutedGame, "human_a").players.find((player) => player.id === "human_b")), "L'identificatore del profilo abbandonato deve restare privato.");
const botsOnlyGame = applyGameAction(substitutedGame, "human_a", { type: "resign" });
assert(botsOnlyGame.phase === "gameover" && !botsOnlyGame.winnerId, "La partita deve chiudersi senza vincitore quando restano soltanto bot.");
let botSetupSteps = 0;
let verifiedSingleBotPlacement = false;
while (botGame.phase === "setup") {
  const current = botGame.players.find((player) => player.id === botGame.currentPlayerId);
  if (current.isBot) {
    const beforePool = current.setupPool;
    botGame = applyGameAction(botGame, "human_a", { type: "advanceBot" });
    if (!verifiedSingleBotPlacement) {
      assert(botGame.players.find((player) => player.id === current.id).setupPool === beforePool - 1, "Anche i bot devono piazzare una sola armata per azione iniziale.");
      verifiedSingleBotPlacement = true;
    }
  } else {
    botGame = applyGameAction(botGame, current.id, { type: "autoSetup" });
  }
  botSetupSteps += 1;
  assert(botSetupSteps < 240, "Lo schieramento con i bot non termina.");
}

let sawBotTurn = false;
let botCompletedTurn = false;
for (let step = 0; step < 80 && botGame.phase !== "gameover" && !botCompletedTurn; step += 1) {
  const current = botGame.players.find((player) => player.id === botGame.currentPlayerId);
  if (current.isBot) {
    sawBotTurn = true;
    botGame = applyGameAction(botGame, "human_a", { type: "advanceBot" });
  } else if (sawBotTurn) {
    botCompletedTurn = true;
  } else if (botGame.phase === "reinforce") {
    const territory = TERRITORIES.find((item) => botGame.territories[item.id].ownerId === current.id);
    botGame = applyGameAction(botGame, current.id, { type: "deploy", territoryId: territory.id, amount: botGame.reinforcementPool });
  } else if (botGame.phase === "attack") {
    botGame = applyGameAction(botGame, current.id, { type: "endAttack" });
  } else if (botGame.phase === "fortify") {
    botGame = applyGameAction(botGame, current.id, { type: "endTurn" });
  }
}
assert(sawBotTurn && botCompletedTurn, "Il bot deve completare rinforzi, attacchi e fine turno come un giocatore.");

console.log(`OK · uscita lobby e passaggio host · ${setupActions} blocchi alternati · timer post-setup · attacchi sicuri · presidio 2 · continente · sdadata · privacy · bot sostitutivo e chiusura senza umani · rivincita`);

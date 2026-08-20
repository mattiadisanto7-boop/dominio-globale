import {
  CONTINENTS,
  PLAYER_COLORS,
  TERRITORIES,
  TERRITORY_BY_ID,
  attackDiceForArmies,
  canAttackWithGarrison,
  defenseDiceForArmies,
  type ContinentId,
  type TerritoryId,
} from "@/lib/game-data";
import { cardTradeValue as tradeValue, validCardTradeSets as validTradeSets } from "@/lib/card-rules";
import { TOURNAMENT_OBJECTIVES } from "@/lib/tournament-objectives";
import type {
  GameAction,
  GamePlayer,
  GameSettings,
  GameState,
  PublicGameState,
  TerritoryCard,
} from "@/lib/game-types";

export class GameRuleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GameRuleError";
    this.status = status;
  }
}

const NEUTRAL_ID = "neutral";
const BOT_NAMES = [
  "Generale Atlas",
  "Comandante Nova",
  "Stratega Orion",
  "Maresciallo Vega",
  "Capitano Echo",
] as const;

const assertRule: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new GameRuleError(message);
};

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swapIndex = values[0] % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const roll = (count: number) => {
  const values = new Uint32Array(count);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => (value % 6) + 1).sort((a, b) => b - a);
};

const stats = () => ({
  attacks: 0,
  victories: 0,
  territoriesConquered: 0,
  armiesLost: 0,
  armiesDefeated: 0,
  setsTraded: 0,
});

const emptyTerritories = () =>
  Object.fromEntries(
    TERRITORIES.map((territory) => [territory.id, { ownerId: NEUTRAL_ID, armies: 0 }]),
  ) as GameState["territories"];

const logItem = (
  state: GameState,
  text: string,
  kind: GameState["log"][number]["kind"] = "system",
) => {
  state.log.unshift({ id: makeId("log"), at: Date.now(), kind, text });
  state.log = state.log.slice(0, 80);
};

const playerById = (state: GameState, playerId: string) => {
  const player = state.players.find((item) => item.id === playerId);
  assertRule(player, "Giocatore non trovato.");
  return player;
};

const playerName = (state: GameState, playerId: string) =>
  playerId === NEUTRAL_ID
    ? "Impero neutrale"
    : state.players.find((player) => player.id === playerId)?.name ?? "Giocatore";

const ownedTerritories = (state: GameState, playerId: string) =>
  TERRITORIES.filter((territory) => state.territories[territory.id].ownerId === playerId);

const ownsContinent = (state: GameState, playerId: string, continent: ContinentId) =>
  TERRITORIES.filter((territory) => territory.continent === continent).every(
    (territory) => state.territories[territory.id].ownerId === playerId,
  );

const reinforcementCount = (state: GameState, playerId: string) => {
  const territoryCount = ownedTerritories(state, playerId).length;
  let result = Math.max(3, Math.floor(territoryCount / 3));
  (Object.keys(CONTINENTS) as ContinentId[]).forEach((continent) => {
    if (ownsContinent(state, playerId, continent)) result += CONTINENTS[continent].bonus;
  });
  return result;
};

const createDeck = (): TerritoryCard[] => {
  const cards: TerritoryCard[] = TERRITORIES.map((territory) => ({
    id: makeId("card"),
    territoryId: territory.id,
    symbol: territory.symbol,
  }));
  cards.push({ id: makeId("card"), symbol: "jolly" });
  cards.push({ id: makeId("card"), symbol: "jolly" });
  return shuffle(cards);
};

export const createLobby = (
  code: string,
  host: { id: string; name: string; profileId?: string },
  settings: GameSettings,
): GameState => ({
  code,
  hostId: host.id,
  phase: "lobby",
  settings,
  createdAt: Date.now(),
  turnOrder: [],
  turnIndex: 0,
  round: 0,
  players: [
    {
      id: host.id,
      name: host.name,
      profileId: host.profileId,
      colorId: PLAYER_COLORS[0].id,
      color: PLAYER_COLORS[0].hex,
      status: "active",
      setupPool: 0,
      cards: [],
      stats: stats(),
    },
  ],
  territories: emptyTerritories(),
  setupBatchRemaining: 0,
  reinforcementPool: 0,
  conqueredThisTurn: false,
  territoriesConqueredThisTurn: 0,
  fortifyUsed: false,
  botAttacksThisTurn: 0,
  deck: [],
  discard: [],
  log: [
    {
      id: makeId("log"),
      at: Date.now(),
      kind: "system",
      text: `${host.name} ha creato la sala.`,
    },
  ],
  messages: [],
});

export const addLobbyPlayer = (state: GameState, player: { id: string; name: string; profileId?: string }) => {
  assertRule(state.phase === "lobby", "La partita è già iniziata.");
  assertRule(state.players.length < state.settings.maxPlayers, "La sala è al completo.");
  assertRule(
    !state.players.some((item) => item.name.toLocaleLowerCase("it") === player.name.toLocaleLowerCase("it")),
    "Questo nome è già usato nella sala.",
  );
  const color = PLAYER_COLORS.find(
    (candidate) => !state.players.some((current) => current.colorId === candidate.id),
  ) ?? PLAYER_COLORS[state.players.length];
  state.players.push({
    id: player.id,
    name: player.name,
    profileId: player.profileId,
    colorId: color.id,
    color: color.hex,
    status: "active",
    setupPool: 0,
    cards: [],
    stats: stats(),
  });
  logItem(state, `${player.name} è entrato nella sala.`);
};

export const removeLobbyPlayer = (original: GameState, playerId: string) => {
  const state = structuredClone(original);
  assertRule(state.phase === "lobby", "La partita è già iniziata.");
  const leaving = playerById(state, playerId);
  assertRule(!leaving.isBot, "Un bot non può uscire autonomamente dalla sala.");
  state.players = state.players.filter((player) => player.id !== playerId);
  if (state.hostId === playerId) {
    state.hostId = state.players.find((player) => !player.isBot)?.id ?? state.players[0]?.id ?? "";
  }
  logItem(state, `${leaving.name} ha lasciato la sala.`);
  return state;
};

const fillLobbyWithBots = (state: GameState) => {
  const added: string[] = [];
  while (state.players.length < state.settings.maxPlayers) {
    const color = PLAYER_COLORS.find(
      (candidate) => !state.players.some((player) => player.colorId === candidate.id),
    );
    assertRule(color, "Non ci sono più colori disponibili per i bot.");
    const baseName = BOT_NAMES.find(
      (candidate) => !state.players.some((player) => player.name === candidate),
    ) ?? `Bot ${state.players.filter((player) => player.isBot).length + 1}`;
    state.players.push({
      id: makeId("bot"),
      name: baseName,
      isBot: true,
      colorId: color.id,
      color: color.hex,
      status: "active",
      setupPool: 0,
      cards: [],
      stats: stats(),
    });
    added.push(baseName);
  }
  assertRule(added.length > 0, "Tutti i posti della sala sono già occupati.");
  logItem(
    state,
    `${added.length} ${added.length === 1 ? "bot strategico aggiunto" : "bot strategici aggiunti"}: ${added.join(", ")}.`,
  );
};

const objectiveDefinitions = () => shuffle(TOURNAMENT_OBJECTIVES.map((objective) => structuredClone(objective)));

const initializeGame = (state: GameState) => {
  if (state.phase === "gameover") {
    state.players.forEach((player) => {
      if (!player.abandoned) return;
      player.abandoned = undefined;
      player.abandonedProfileId = undefined;
    });
  }
  const players = state.phase === "gameover"
    ? [...state.players]
    : state.players.filter((player) => player.status === "active");
  assertRule(players.length >= 2, "Servono almeno 2 giocatori per iniziare.");
  const shuffledTerritories = shuffle(TERRITORIES.map((territory) => territory.id));
  state.territories = emptyTerritories();
  state.turnOrder = shuffle(players.map((player) => player.id));
  state.turnIndex = 0;
  state.round = 1;
  state.matchId = makeId("match");
  state.currentPlayerId = state.turnOrder[0];
  state.phase = "setup";
  state.startedAt = undefined;
  state.deadlineAt = undefined;
  state.finishedAt = undefined;
  state.timedEndgame = undefined;
  state.deck = createDeck();
  state.discard = [];
  state.reinforcementPool = 0;
  state.setupBatchRemaining = 0;
  state.resumePhase = undefined;
  state.conqueredThisTurn = false;
  state.territoriesConqueredThisTurn = 0;
  state.fortifyUsed = false;
  state.botAttacksThisTurn = 0;
  state.pendingBattle = undefined;
  state.pendingMove = undefined;
  state.lastBattle = undefined;
  state.lastContinentConquest = undefined;
  state.lastSuddenDeath = undefined;
  state.winnerId = undefined;
  state.victoryReason = undefined;
  state.settings.mode = "missioni";
  state.settings.defense = "automatic";

  players.forEach((player) => {
    player.status = "active";
    player.eliminatedBy = undefined;
    player.cards = [];
    player.lastDrawnCard = undefined;
    player.lastDrawnAt = undefined;
    player.stats = stats();
    player.objective = undefined;
  });

  if (players.length === 2) {
    shuffledTerritories.slice(0, 28).forEach((territoryId, index) => {
      state.territories[territoryId] = { ownerId: players[index % 2].id, armies: 1 };
    });
    shuffledTerritories.slice(28).forEach((territoryId) => {
      state.territories[territoryId] = { ownerId: NEUTRAL_ID, armies: 2 };
    });
  } else {
    shuffledTerritories.forEach((territoryId, index) => {
      state.territories[territoryId] = {
        ownerId: players[index % players.length].id,
        armies: 1,
      };
    });
  }

  const initialArmies = ({ 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 } as Record<number, number>)[
    players.length
  ];
  players.forEach((player) => {
    player.setupPool = initialArmies - ownedTerritories(state, player.id).length;
  });
  state.setupBatchRemaining = Math.min(3, playerById(state, state.currentPlayerId).setupPool);

  const objectives = objectiveDefinitions();
  players.forEach((player, index) => {
    player.objective = objectives[index];
  });
  logItem(
    state,
    `Territori e obiettivi assegnati. ${playerName(state, state.currentPlayerId)} apre lo schieramento: 3 armate, anche su territori differenti.`,
    "turn",
  );
};

const allSetupComplete = (state: GameState) =>
  state.players.filter((player) => player.status === "active").every((player) => player.setupPool === 0);

const advanceSetupTurn = (state: GameState) => {
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const nextIndex = (state.turnIndex + offset) % state.turnOrder.length;
    const next = playerById(state, state.turnOrder[nextIndex]);
    if (next.status === "active" && next.setupPool > 0) {
      state.turnIndex = nextIndex;
      state.currentPlayerId = next.id;
      state.setupBatchRemaining = Math.min(3, next.setupPool);
      return;
    }
  }
  throw new GameRuleError("Impossibile determinare il prossimo schieramento.");
};

const beginFirstTurn = (state: GameState) => {
  const firstIndex = state.turnOrder.findIndex((playerId) => playerById(state, playerId).status === "active");
  assertRule(firstIndex >= 0, "Non ci sono giocatori attivi.");
  const firstId = state.turnOrder[firstIndex];
  state.currentPlayerId = firstId;
  state.turnIndex = firstIndex;
  state.phase = "reinforce";
  state.setupBatchRemaining = 0;
  state.startedAt = Date.now();
  state.deadlineAt = state.settings.timeLimitMinutes
    ? state.startedAt + state.settings.timeLimitMinutes * 60_000
    : undefined;
  state.timedEndgame = state.deadlineAt
    ? { stage: "running", threshold: 4, turnsAtThreshold: 0 }
    : undefined;
  state.reinforcementPool = reinforcementCount(state, firstId);
  logItem(
    state,
    `Schieramento completato. ${state.settings.timeLimitMinutes ? `Parte ora il timer da ${state.settings.timeLimitMinutes} minuti.` : "Il timer è disattivato."} Inizia ${playerName(state, firstId)} con ${state.reinforcementPool} rinforzi.`,
    "turn",
  );
};

const normalizeSetupTurn = (state: GameState) => {
  if (state.phase !== "setup") return;
  if (allSetupComplete(state)) {
    beginFirstTurn(state);
    return;
  }
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  if (current?.status === "active" && current.setupPool > 0) {
    if (!Number.isFinite(state.setupBatchRemaining) || state.setupBatchRemaining <= 0) {
      state.setupBatchRemaining = Math.min(3, current.setupPool);
    } else {
      state.setupBatchRemaining = Math.min(state.setupBatchRemaining, current.setupPool);
    }
    return;
  }
  const nextIndex = state.turnOrder.findIndex((playerId) => {
    const player = playerById(state, playerId);
    return player.status === "active" && player.setupPool > 0;
  });
  assertRule(nextIndex >= 0, "Non ci sono schieramenti disponibili.");
  state.turnIndex = nextIndex;
  state.currentPlayerId = state.turnOrder[nextIndex];
  state.setupBatchRemaining = Math.min(3, playerById(state, state.currentPlayerId).setupPool);
};

const drawCard = (state: GameState, player: GamePlayer) => {
  if (!state.deck.length && state.discard.length) {
    state.deck = shuffle(state.discard);
    state.discard = [];
  }
  const card = state.deck.pop();
  if (card) {
    player.cards.push(card);
    player.lastDrawnCard = structuredClone(card);
    player.lastDrawnAt = Date.now();
    logItem(state, `${player.name} riceve una carta territorio.`, "cards");
  }
};

const beginAttackWhenReady = (state: GameState, player: GamePlayer) => {
  if (state.reinforcementPool > 0) return false;
  if (player.cards.length >= 5 && validTradeSets(player.cards).length > 0) return false;
  state.phase = state.resumePhase ?? "attack";
  state.resumePhase = undefined;
  logItem(state, `${player.name} ha completato i rinforzi: inizia automaticamente la fase d'attacco.`, "turn");
  return true;
};

const isConnectedThroughOwned = (
  state: GameState,
  playerId: string,
  from: TerritoryId,
  to: TerritoryId,
) => {
  const visited = new Set<TerritoryId>([from]);
  const queue: TerritoryId[] = [from];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) return true;
    TERRITORY_BY_ID[current].adjacent.forEach((next) => {
      if (!visited.has(next) && state.territories[next].ownerId === playerId) {
        visited.add(next);
        queue.push(next);
      }
    });
  }
  return false;
};

const bordersEnemy = (state: GameState, territoryId: TerritoryId, playerId: string) =>
  TERRITORY_BY_ID[territoryId].adjacent.some(
    (adjacentId) => state.territories[adjacentId].ownerId !== playerId,
  );

const normalizeRuntimeState = (state: GameState) => {
  if (!Number.isFinite(state.setupBatchRemaining)) state.setupBatchRemaining = 0;
  if (!Number.isFinite(state.botAttacksThisTurn)) state.botAttacksThisTurn = 0;
  if (!Number.isFinite(state.territoriesConqueredThisTurn)) {
    state.territoriesConqueredThisTurn = state.conqueredThisTurn ? 1 : 0;
  }
  if (state.deadlineAt && !state.timedEndgame && state.phase !== "gameover") {
    state.timedEndgame = { stage: "running", threshold: 4, turnsAtThreshold: 0 };
  }
  if (!state.deadlineAt) state.timedEndgame = undefined;
  if (state.phase === "gameover" && !state.finishedAt) {
    state.finishedAt = state.lastSuddenDeath?.at ?? state.lastBattle?.at ?? state.log[0]?.at ?? Date.now();
  }
  if (state.pendingMove) {
    const sourceMinimum = bordersEnemy(state, state.pendingMove.from, state.pendingMove.playerId) ? 2 : 1;
    const sourceArmies = state.territories[state.pendingMove.from].armies;
    const legalMaximum = Math.max(1, sourceArmies - sourceMinimum);
    state.pendingMove.sourceMinimum = sourceMinimum;
    state.pendingMove.max = Math.min(state.pendingMove.max, legalMaximum);
    state.pendingMove.min = Math.min(state.pendingMove.min, state.pendingMove.max);
    state.pendingMove.forcedException = false;
  }
};

const syncTimedEndgame = (state: GameState) => {
  if (
    state.phase === "lobby" ||
    state.phase === "gameover" ||
    !state.deadlineAt ||
    !state.timedEndgame ||
    state.timedEndgame.stage !== "running" ||
    Date.now() < state.deadlineAt
  ) return;
  state.timedEndgame.stage = "penultimate";
  state.timedEndgame.activatedAt = Date.now();
  state.timedEndgame.threshold = 4;
  state.timedEndgame.turnsAtThreshold = 0;
  logItem(
    state,
    "Tempo scaduto: si completa il giro in corso, poi si giocherà l'ultimo giro completo prima della sdadata.",
    "turn",
  );
};

const objectiveMet = (state: GameState, player: GamePlayer) => {
  const objective = player.objective;
  if (!objective) return false;
  return objective.territoryIds.every((territoryId) => state.territories[territoryId].ownerId === player.id);
};

const finishGame = (state: GameState, winnerId: string, reason: string) => {
  state.phase = "gameover";
  state.finishedAt = Date.now();
  state.winnerId = winnerId;
  state.victoryReason = reason;
  state.pendingBattle = undefined;
  state.pendingMove = undefined;
  playerById(state, winnerId).stats.victories += 1;
  logItem(state, `${playerName(state, winnerId)} vince: ${reason}`, "victory");
};

const closeGameWithoutHumans = (state: GameState) => {
  state.phase = "gameover";
  state.finishedAt = Date.now();
  state.currentPlayerId = undefined;
  state.winnerId = undefined;
  state.victoryReason = "Partita chiusa: non è rimasto nessun giocatore umano.";
  state.pendingBattle = undefined;
  state.pendingMove = undefined;
  logItem(state, state.victoryReason, "system");
};

const checkVictory = (state: GameState, playerId: string) => {
  const active = state.players.filter((player) => player.status === "active");
  if (active.length === 1) {
    finishGame(state, active[0].id, "è l'ultima armata rimasta sulla mappa.");
    return true;
  }
  const player = playerById(state, playerId);
  if (objectiveMet(state, player)) {
    finishGame(state, player.id, player.objective?.description ?? "obiettivo completato.");
    return true;
  }
  return false;
};

const resolveBattle = (state: GameState, defenderDice: number[]) => {
  const battle = state.pendingBattle;
  assertRule(battle, "Non c'è una battaglia in attesa.");
  const from = state.territories[battle.from];
  const to = state.territories[battle.to];
  const attacker = playerById(state, battle.attackerId);
  const defender = battle.defenderId === NEUTRAL_ID ? undefined : playerById(state, battle.defenderId);
  let attackerLosses = 0;
  let defenderLosses = 0;
  const comparisons = Math.min(battle.attackerDice.length, defenderDice.length);
  for (let index = 0; index < comparisons; index += 1) {
    if (battle.attackerDice[index] > defenderDice[index]) defenderLosses += 1;
    else attackerLosses += 1;
  }
  from.armies -= attackerLosses;
  to.armies -= defenderLosses;
  attacker.stats.attacks += 1;
  attacker.stats.armiesLost += attackerLosses;
  attacker.stats.armiesDefeated += defenderLosses;
  if (defender) {
    defender.stats.armiesLost += defenderLosses;
    defender.stats.armiesDefeated += attackerLosses;
  }

  const conquered = to.armies <= 0;
  state.lastBattle = {
    from: battle.from,
    to: battle.to,
    attackerDice: battle.attackerDice,
    defenderDice,
    attackerLosses,
    defenderLosses,
    conquered,
    at: Date.now(),
  };
  logItem(
    state,
    `${playerName(state, battle.attackerId)} attacca ${TERRITORY_BY_ID[battle.to].name}: ` +
      `${attackerLosses} perdite in attacco, ${defenderLosses} in difesa.`,
    "battle",
  );

  state.pendingBattle = undefined;
  if (!conquered) return;

  const defeatedOwnerId = to.ownerId;
  to.ownerId = battle.attackerId;
  to.armies = 0;
  state.conqueredThisTurn = true;
  state.territoriesConqueredThisTurn += 1;
  attacker.stats.territoriesConquered += 1;
  const borderMinimum = bordersEnemy(state, battle.from, battle.attackerId) ? 2 : 1;
  const max = from.armies - borderMinimum;
  assertRule(max >= 1, "La conquista non può lasciare il territorio di partenza sotto il presidio minimo.");
  const min = Math.max(1, Math.min(battle.requestedDice, max));
  state.pendingMove = {
    playerId: battle.attackerId,
    from: battle.from,
    to: battle.to,
    min,
    max,
    sourceMinimum: borderMinimum,
    forcedException: false,
  };

  const conqueredContinent = TERRITORY_BY_ID[battle.to].continent;
  if (ownsContinent(state, battle.attackerId, conqueredContinent)) {
    state.lastContinentConquest = {
      playerId: battle.attackerId,
      continent: conqueredContinent,
      at: state.lastBattle.at,
    };
    logItem(
      state,
      `${attacker.name} conquista l'intero continente ${CONTINENTS[conqueredContinent].name}!`,
      "victory",
    );
  }

  if (defeatedOwnerId !== NEUTRAL_ID && ownedTerritories(state, defeatedOwnerId).length === 0) {
    const eliminated = playerById(state, defeatedOwnerId);
    eliminated.status = "eliminated";
    eliminated.eliminatedBy = battle.attackerId;
    attacker.cards.push(...eliminated.cards);
    eliminated.cards = [];
    logItem(state, `${attacker.name} ha eliminato ${eliminated.name} e ne riceve le carte.`, "battle");
  }
};

const nextActiveTurnIndex = (state: GameState) => {
  const previousIndex = state.turnIndex;
  let nextIndex = previousIndex;
  do {
    nextIndex = (nextIndex + 1) % state.turnOrder.length;
  } while (playerById(state, state.turnOrder[nextIndex]).status !== "active" && nextIndex !== previousIndex);
  return nextIndex;
};

const nextTurnWraps = (state: GameState) => nextActiveTurnIndex(state) <= state.turnIndex;

const nextTurn = (state: GameState) => {
  const previousIndex = state.turnIndex;
  const nextIndex = nextActiveTurnIndex(state);
  const wrapped = nextIndex <= previousIndex;
  if (wrapped) {
    state.round += 1;
    if (state.timedEndgame?.stage === "penultimate") {
      state.timedEndgame.stage = "last-round";
      logItem(state, "Inizia l'ultimo giro completo. Al termine partirà la sdadata con soglia 4.", "turn");
    }
  }
  state.turnIndex = nextIndex;
  state.currentPlayerId = state.turnOrder[nextIndex];
  state.phase = "reinforce";
  state.resumePhase = undefined;
  state.reinforcementPool = reinforcementCount(state, state.currentPlayerId);
  state.conqueredThisTurn = false;
  state.territoriesConqueredThisTurn = 0;
  state.fortifyUsed = false;
  state.botAttacksThisTurn = 0;
  state.lastBattle = undefined;
  logItem(
    state,
    `Turno di ${playerName(state, state.currentPlayerId)}: ${state.reinforcementPool} rinforzi.`,
    "turn",
  );
};

const requireCurrentPlayer = (state: GameState, playerId: string) => {
  assertRule(state.currentPlayerId === playerId, "Non è il tuo turno.");
  const player = playerById(state, playerId);
  assertRule(player.status === "active", "Non sei più in partita.");
  return player;
};

const timedRanking = (state: GameState) => {
  const ranked = state.players
    .filter((player) => player.status === "active")
    .map((player) => {
      const targetIds = player.objective?.territoryIds ?? [];
      const targetSet = new Set(targetIds);
      const owned = ownedTerritories(state, player.id);
      const secured = owned.filter((territory) => targetSet.has(territory.id));
      const outside = owned.filter((territory) => !targetSet.has(territory.id));
      const score = secured.reduce((sum, territory) => sum + territory.value, 0);
      const outsideScore = outside.reduce((sum, territory) => sum + territory.value, 0);
      const targetArmies = secured.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
      const outsideArmies = outside.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
      return {
        player,
        score,
        outsideScore,
        targetArmies,
        outsideArmies,
        cards: player.cards.length,
        secured: secured.length,
        outside: outside.length,
        reverseTurnOrder: state.turnOrder.indexOf(player.id),
      };
    })
    .sort((a, b) =>
      b.score - a.score ||
      b.outsideScore - a.outsideScore ||
      b.targetArmies - a.targetArmies ||
      b.outsideArmies - a.outsideArmies ||
      b.cards - a.cards ||
      b.secured - a.secured ||
      b.outside - a.outside ||
      b.reverseTurnOrder - a.reverseTurnOrder,
    );
  assertRule(ranked.length > 0, "Non ci sono giocatori da classificare.");
  return ranked;
};

const finishTimedGame = (state: GameState, closingPlayerId: string, total: number, threshold: number) => {
  const winner = timedRanking(state)[0];
  finishGame(
    state,
    winner.player.id,
    `${playerName(state, closingPlayerId)} ha chiuso la sdadata con ${total} (soglia ${threshold}); ` +
      `${winner.player.name} vince con ${winner.score}/86 punti nei territori obiettivo.`,
  );
};

const resolveSuddenDeathTurn = (state: GameState, playerId: string) => {
  const timed = state.timedEndgame;
  assertRule(timed?.stage === "sudden-death", "La sdadata non è ancora iniziata.");
  const threshold = timed.threshold;
  const conqueredTerritories = state.territoriesConqueredThisTurn;
  const skipped = conqueredTerritories > 2;
  const dice = skipped ? undefined : (roll(2) as [number, number]);
  const total = dice?.reduce((sum, value) => sum + value, 0);
  const closed = total !== undefined && total <= threshold;
  state.lastSuddenDeath = {
    playerId,
    dice,
    total,
    threshold,
    closed,
    skipped,
    conqueredTerritories,
    at: Date.now(),
  };
  if (skipped) {
    logItem(
      state,
      `${playerName(state, playerId)} ha conquistato ${conqueredTerritories} territori: lancio della sdadata saltato.`,
      "turn",
    );
  } else {
    logItem(
      state,
      `${playerName(state, playerId)} lancia la sdadata: ${dice!.join(" + ")} = ${total}, soglia ${threshold}${closed ? " — partita chiusa!" : "."}`,
      closed ? "victory" : "turn",
    );
  }
  if (closed) {
    finishTimedGame(state, playerId, total!, threshold);
    return true;
  }

  timed.turnsAtThreshold += 1;
  const activePlayers = state.players.filter((player) => player.status === "active").length;
  if (timed.turnsAtThreshold >= activePlayers) {
    timed.turnsAtThreshold = 0;
    if (timed.threshold < 7) {
      timed.threshold = (timed.threshold + 1) as 5 | 6 | 7;
      logItem(state, `Nessuna chiusura nel giro: la soglia della sdadata sale a ${timed.threshold}.`, "turn");
    }
  }
  return false;
};

const resolveTimedTurnEnd = (state: GameState, playerId: string) => {
  const timed = state.timedEndgame;
  if (!timed) return false;
  if (timed.stage === "last-round" && nextTurnWraps(state)) {
    timed.stage = "sudden-death";
    timed.threshold = 4;
    timed.turnsAtThreshold = 0;
    logItem(state, "Ultimo giro concluso: comincia la sdadata. Si chiude con una somma pari o inferiore a 4.", "turn");
  }
  if (timed.stage !== "sudden-death") return false;
  return resolveSuddenDeathTurn(state, playerId);
};

const enemyNeighbours = (state: GameState, playerId: string, territoryId: TerritoryId) =>
  TERRITORY_BY_ID[territoryId].adjacent.filter(
    (adjacentId) => state.territories[adjacentId].ownerId !== playerId,
  );

const enemyPressure = (state: GameState, playerId: string, territoryId: TerritoryId) =>
  enemyNeighbours(state, playerId, territoryId).reduce(
    (sum, adjacentId) => sum + state.territories[adjacentId].armies,
    0,
  );

const continentProgress = (state: GameState, playerId: string, continent: ContinentId) => {
  const territories = TERRITORIES.filter((territory) => territory.continent === continent);
  return territories.filter((territory) => state.territories[territory.id].ownerId === playerId).length / territories.length;
};

const botTerritoryScore = (state: GameState, bot: GamePlayer, territoryId: TerritoryId) => {
  const territory = state.territories[territoryId];
  const definition = TERRITORY_BY_ID[territoryId];
  const enemies = enemyNeighbours(state, bot.id, territoryId);
  const pressure = enemyPressure(state, bot.id, territoryId);
  const mission = bot.objective?.territoryIds.includes(territoryId) ? 34 : 0;
  const progress = continentProgress(state, bot.id, definition.continent) * 22;
  const exposedMissionTargets = enemies.filter((id) => bot.objective?.territoryIds.includes(id)).length * 18;
  return enemies.length * 22 + pressure * 2.2 + mission + progress + exposedMissionTargets - territory.armies * 2.5;
};

const bestBotTrade = (state: GameState, bot: GamePlayer) => validTradeSets(bot.cards)
  .map((cardIds) => {
    const cards = cardIds.map((id) => bot.cards.find((card) => card.id === id)!).filter(Boolean);
    const ownedBonus = cards.some(
      (card) => card.territoryId && state.territories[card.territoryId].ownerId === bot.id,
    ) ? 2 : 0;
    return { cardIds, score: tradeValue(cards) * 10 + ownedBonus };
  })
  .sort((left, right) => right.score - left.score)[0]?.cardIds;

const chooseBotAction = (state: GameState, bot: GamePlayer): GameAction => {
  const trade = bestBotTrade(state, bot);
  if ((state.phase === "reinforce" || state.phase === "attack") && bot.cards.length >= 3 && trade) {
    return { type: "tradeCards", cardIds: trade };
  }

  if (state.phase === "setup") {
    const target = ownedTerritories(state, bot.id)
      .sort((left, right) =>
        botTerritoryScore(state, bot, right.id) - botTerritoryScore(state, bot, left.id) ||
        state.territories[left.id].armies - state.territories[right.id].armies ||
        left.id.localeCompare(right.id),
      )[0];
    assertRule(target, "Il bot non ha territori su cui schierare.");
    return { type: "placeSetup", territoryId: target.id };
  }

  if (state.phase === "reinforce") {
    if (state.reinforcementPool <= 0) return { type: "beginAttack" };
    const target = ownedTerritories(state, bot.id).map((territory) => {
      const enemies = enemyNeighbours(state, bot.id, territory.id);
      const offensiveScore = enemies.reduce((best, enemyId) => {
        const enemy = state.territories[enemyId];
        const enemyDefinition = TERRITORY_BY_ID[enemyId];
        const mission = bot.objective?.territoryIds.includes(enemyId) ? 36 : 0;
        const wouldCompleteContinent = TERRITORIES
          .filter((item) => item.continent === enemyDefinition.continent && item.id !== enemyId)
          .every((item) => state.territories[item.id].ownerId === bot.id);
        const marginAfterDeploy = state.territories[territory.id].armies + state.reinforcementPool - enemy.armies;
        return Math.max(best, marginAfterDeploy * 8 + mission + (wouldCompleteContinent ? 75 : 0) + enemyDefinition.value * 3);
      }, 0);
      const defensiveScore = Math.max(0, enemyPressure(state, bot.id, territory.id) - state.territories[territory.id].armies) * 5;
      return {
        territory,
        score: botTerritoryScore(state, bot, territory.id) + offensiveScore + defensiveScore,
      };
    }).sort((left, right) => right.score - left.score || left.territory.id.localeCompare(right.territory.id))[0]?.territory;
    assertRule(target, "Il bot non ha territori da rinforzare.");
    return { type: "deploy", territoryId: target.id, amount: state.reinforcementPool };
  }

  if (state.phase === "attack") {
    if (state.pendingMove) {
      const move = state.pendingMove;
      const destinationPressure = enemyPressure(state, bot.id, move.to);
      const sourcePressure = enemyPressure(state, bot.id, move.from);
      const destinationIsMission = Boolean(bot.objective?.territoryIds.includes(move.to));
      const desired = destinationPressure > 0 || destinationIsMission
        ? sourcePressure > destinationPressure
          ? Math.ceil((move.min + move.max) / 2)
          : move.max
        : move.min;
      return { type: "moveAfterConquest", amount: Math.max(move.min, Math.min(move.max, desired)) };
    }
    if (state.botAttacksThisTurn >= 14) return { type: "endAttack" };
    const missionTargets = new Set(bot.objective?.territoryIds ?? []);
    const candidates = ownedTerritories(state, bot.id).flatMap((fromDefinition) => {
      const from = state.territories[fromDefinition.id];
      return fromDefinition.adjacent
        .filter((toId) => {
          const to = state.territories[toId];
          const hasOtherEnemyBorder = fromDefinition.adjacent.some(
            (adjacentId) => adjacentId !== toId && state.territories[adjacentId].ownerId !== bot.id,
          );
          return to.ownerId !== bot.id &&
            canAttackWithGarrison(from.armies, to.armies, hasOtherEnemyBorder);
        })
        .map((toId) => {
          const to = state.territories[toId];
          const continent = TERRITORY_BY_ID[toId].continent;
          const completesContinent = TERRITORIES
            .filter((territory) => territory.continent === continent && territory.id !== toId)
            .every((territory) => state.territories[territory.id].ownerId === bot.id);
          const defenderTerritories = to.ownerId === NEUTRAL_ID ? 99 : ownedTerritories(state, to.ownerId).length;
          const eliminatesOpponent = defenderTerritories === 1;
          const margin = from.armies - to.armies;
          const strategic = missionTargets.has(toId) || completesContinent || eliminatesOpponent;
          const safeEnough = margin >= 1 || (strategic && margin >= -1 && from.armies >= 5);
          const repeatsBattle = state.lastBattle?.from === fromDefinition.id && state.lastBattle.to === toId && !state.lastBattle.conquered;
          const score = margin * 12 + TERRITORY_BY_ID[toId].value * 4 +
            (missionTargets.has(toId) ? 42 : 0) +
            (completesContinent ? 90 : continentProgress(state, bot.id, continent) * 18) +
            (eliminatesOpponent ? 48 : 0) +
            (repeatsBattle ? 14 : 0) - to.armies * 2;
          return { from: fromDefinition.id, to: toId, score, safeEnough };
        });
    }).filter((candidate) => candidate.safeEnough)
      .sort((left, right) => right.score - left.score || left.to.localeCompare(right.to));
    const attack = candidates[0];
    return attack
      ? { type: "attack", from: attack.from, to: attack.to }
      : { type: "endAttack" };
  }

  if (state.phase === "fortify") {
    if (state.fortifyUsed) return { type: "endTurn" };
    const borderTargets = ownedTerritories(state, bot.id)
      .filter((territory) => bordersEnemy(state, territory.id, bot.id))
      .sort((left, right) =>
        (enemyPressure(state, bot.id, right.id) - state.territories[right.id].armies) -
          (enemyPressure(state, bot.id, left.id) - state.territories[left.id].armies) ||
        botTerritoryScore(state, bot, right.id) - botTerritoryScore(state, bot, left.id),
      );
    for (const target of borderTargets) {
      const source = ownedTerritories(state, bot.id)
        .filter((territory) => territory.id !== target.id && isConnectedThroughOwned(state, bot.id, territory.id, target.id))
        .map((territory) => {
          const minimum = bordersEnemy(state, territory.id, bot.id) ? 2 : 1;
          return { territory, movable: state.territories[territory.id].armies - minimum };
        })
        .filter((candidate) => candidate.movable > 0)
        .sort((left, right) => right.movable - left.movable)[0];
      if (source) {
        return {
          type: "fortify",
          from: source.territory.id,
          to: target.id,
          amount: source.movable,
        };
      }
    }
    return { type: "endTurn" };
  }

  throw new GameRuleError("Il bot non può agire in questa fase.");
};

export const applyGameAction = (original: GameState, playerId: string, action: GameAction): GameState => {
  const state = structuredClone(original);
  normalizeRuntimeState(state);
  normalizeSetupTurn(state);
  syncTimedEndgame(state);
  const actor = playerById(state, playerId);

  if (action.type === "sendMessage") {
    const text = action.text.trim().replace(/\s+/g, " ").slice(0, 180);
    assertRule(text.length > 0, "Scrivi un messaggio.");
    state.messages.push({ id: makeId("msg"), playerId, text, at: Date.now() });
    state.messages = state.messages.slice(-60);
    return state;
  }

  if (action.type === "advanceBot") {
    assertRule(!actor.isBot, "Soltanto un giocatore reale può sincronizzare i bot.");
    assertRule(state.phase !== "lobby" && state.phase !== "gameover", "Non c'è un turno bot da eseguire.");
    const bot = playerById(state, state.currentPlayerId ?? "");
    assertRule(bot.isBot && bot.status === "active", "Il giocatore corrente non è un bot.");
    return applyGameAction(state, bot.id, chooseBotAction(state, bot));
  }

  if (action.type === "updateSettings") {
    assertRule(state.phase === "lobby", "Le impostazioni sono bloccate dopo l'inizio.");
    assertRule(state.hostId === playerId, "Solo chi ospita può cambiare le impostazioni.");
    const next = { ...state.settings, ...action.settings };
    assertRule([2, 3, 4, 5, 6].includes(next.maxPlayers), "Numero di giocatori non valido.");
    assertRule(next.maxPlayers >= state.players.length, "Il limite è inferiore ai giocatori presenti.");
    assertRule([0, 45, 60, 90].includes(next.timeLimitMinutes), "Durata non valida.");
    assertRule(!next.visibility || ["public", "private"].includes(next.visibility), "Visibilità non valida.");
    next.mode = "missioni";
    next.visibility = next.visibility ?? "private";
    state.settings = next;
    logItem(state, `${actor.name} ha aggiornato le regole della sala.`);
    return state;
  }

  if (action.type === "chooseColor") {
    assertRule(state.phase === "lobby", "Puoi scegliere il colore soltanto nella sala d'attesa.");
    assertRule(!actor.isBot, "I colori dei bot vengono assegnati automaticamente.");
    const color = PLAYER_COLORS.find((candidate) => candidate.id === action.colorId);
    assertRule(color, "Colore non disponibile.");
    const occupiedBy = state.players.find(
      (player) => player.id !== playerId && player.colorId === color.id,
    );
    assertRule(!occupiedBy, `${color.name} è già stato scelto da ${occupiedBy?.name ?? "un altro giocatore"}.`);
    actor.colorId = color.id;
    actor.color = color.hex;
    logItem(state, `${actor.name} sceglie il colore ${color.name}.`);
    return state;
  }

  if (action.type === "fillWithBots") {
    assertRule(state.phase === "lobby", "I bot possono entrare soltanto prima della partita.");
    assertRule(state.hostId === playerId, "Solo chi ospita può aggiungere i bot.");
    fillLobbyWithBots(state);
    return state;
  }

  if (action.type === "kickPlayer") {
    assertRule(state.phase === "lobby", "Non puoi rimuovere giocatori a partita iniziata.");
    assertRule(state.hostId === playerId, "Solo chi ospita può rimuovere un giocatore.");
    assertRule(action.playerId !== playerId, "Non puoi rimuovere te stesso.");
    const kicked = playerById(state, action.playerId);
    state.players = state.players.filter((player) => player.id !== action.playerId);
    logItem(state, `${kicked.name} è stato rimosso dalla sala.`);
    return state;
  }

  if (action.type === "startGame") {
    assertRule(state.phase === "lobby", "La partita è già iniziata.");
    assertRule(state.hostId === playerId, "Solo chi ospita può iniziare.");
    initializeGame(state);
    return state;
  }

  if (action.type === "resign") {
    if (state.phase === "lobby") {
      assertRule(playerId !== state.hostId, "Chi ospita non può abbandonare la propria sala.");
      state.players = state.players.filter((player) => player.id !== playerId);
      logItem(state, `${actor.name} ha lasciato la sala.`);
      return state;
    }
    assertRule(!actor.isBot && !actor.abandoned, "Hai già abbandonato la partita.");
    actor.abandoned = true;
    actor.abandonedProfileId = actor.profileId;
    actor.profileId = undefined;
    const remainingHumans = state.players.filter(
      (player) => player.id !== playerId && !player.isBot && !player.abandoned && player.status === "active",
    );
    if (actor.status === "active") actor.isBot = true;
    if (state.hostId === playerId && remainingHumans.length) state.hostId = remainingHumans[0].id;
    if (!remainingHumans.length) {
      closeGameWithoutHumans(state);
    } else if (actor.status === "active") {
      logItem(state, `${actor.name} ha abbandonato: un bot sostitutivo continuerà a giocare al suo posto.`, "system");
    } else {
      logItem(state, `${actor.name} ha lasciato la partita.`, "system");
    }
    return state;
  }

  if (action.type === "placeSetup") {
    assertRule(state.phase === "setup", "La fase di schieramento è terminata.");
    requireCurrentPlayer(state, playerId);
    const territory = state.territories[action.territoryId];
    assertRule(territory?.ownerId === playerId, "Puoi schierare solo nei tuoi territori.");
    assertRule(actor.setupPool > 0 && state.setupBatchRemaining > 0, "Hai già completato questo blocco di schieramento.");
    territory.armies += 1;
    actor.setupPool -= 1;
    state.setupBatchRemaining -= 1;
    logItem(
      state,
      `${actor.name} schiera 1 armata in ${TERRITORY_BY_ID[action.territoryId].name}` +
        `${state.setupBatchRemaining ? ` (${state.setupBatchRemaining} ancora prima del cambio)` : "."}`,
      "turn",
    );
    if (actor.setupPool === 0 || state.setupBatchRemaining === 0) {
      if (allSetupComplete(state)) beginFirstTurn(state);
      else advanceSetupTurn(state);
    }
    return state;
  }

  if (action.type === "autoSetup") {
    assertRule(state.phase === "setup", "La fase di schieramento è terminata.");
    requireCurrentPlayer(state, playerId);
    assertRule(actor.setupPool > 0, "Hai già schierato tutte le armate.");
    const owned = ownedTerritories(state, playerId);
    const amount = Math.min(state.setupBatchRemaining, actor.setupPool);
    assertRule(amount > 0, "Hai già completato questo blocco di schieramento.");
    for (let index = 0; index < amount; index += 1) {
      owned.sort((left, right) =>
        state.territories[left.id].armies - state.territories[right.id].armies || left.id.localeCompare(right.id),
      );
      state.territories[owned[0].id].armies += 1;
      actor.setupPool -= 1;
      state.setupBatchRemaining -= 1;
    }
    logItem(state, `${actor.name} distribuisce automaticamente ${amount} armate sui territori meno presidiati.`, "turn");
    if (allSetupComplete(state)) beginFirstTurn(state);
    else advanceSetupTurn(state);
    return state;
  }

  if (action.type === "tradeCards") {
    const current = requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "reinforce" || state.phase === "attack", "Puoi cambiare carte solo all'inizio o durante il tuo turno.");
    const selected = action.cardIds.map((id) => current.cards.find((card) => card.id === id));
    assertRule(selected.every(Boolean), "Una delle carte selezionate non è disponibile.");
    const cards = selected as TerritoryCard[];
    const value = tradeValue(cards);
    assertRule(value > 0, "Queste carte non formano una combinazione valida.");
    current.cards = current.cards.filter((card) => !action.cardIds.includes(card.id));
    state.discard.push(...cards);
    current.stats.setsTraded += 1;
    if (state.phase === "attack") {
      state.phase = "reinforce";
      state.resumePhase = "attack";
    }
    state.reinforcementPool += value;
    const ownedCard = cards.find(
      (card) => card.territoryId && state.territories[card.territoryId].ownerId === playerId,
    );
    if (ownedCard?.territoryId) state.territories[ownedCard.territoryId].armies += 2;
    logItem(
      state,
      `${current.name} scambia un tris: +${value} armate${ownedCard ? " e +2 sul territorio abbinato" : ""}.`,
      "cards",
    );
    return state;
  }

  if (action.type === "deploy") {
    const current = requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "reinforce", "Non è il momento di schierare rinforzi.");
    assertRule(current.cards.length < 5 || validTradeSets(current.cards).length === 0, "Con 5 o più carte devi prima giocare un tris.");
    const territory = state.territories[action.territoryId];
    assertRule(territory?.ownerId === playerId, "Puoi rinforzare solo i tuoi territori.");
    const amount = Math.floor(action.amount);
    assertRule(amount > 0 && amount <= state.reinforcementPool, "Quantità di armate non valida.");
    territory.armies += amount;
    state.reinforcementPool -= amount;
    if (state.reinforcementPool === 0) beginAttackWhenReady(state, current);
    return state;
  }

  if (action.type === "beginAttack") {
    const current = requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "reinforce", "La fase d'attacco è già iniziata.");
    assertRule(state.reinforcementPool === 0, "Devi prima schierare tutti i rinforzi.");
    assertRule(current.cards.length < 5 || validTradeSets(current.cards).length === 0, "Con 5 o più carte devi giocare un tris.");
    beginAttackWhenReady(state, current);
    return state;
  }

  if (action.type === "attack") {
    requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "attack", "Non è la fase d'attacco.");
    assertRule(!state.pendingBattle && !state.pendingMove, "Completa prima la battaglia in corso.");
    const from = state.territories[action.from];
    const to = state.territories[action.to];
    assertRule(from?.ownerId === playerId, "Il territorio di partenza non è tuo.");
    assertRule(to && to.ownerId !== playerId, "Scegli un territorio avversario.");
    assertRule(TERRITORY_BY_ID[action.from].adjacent.includes(action.to), "I territori non confinano.");
    const hasOtherEnemyBorder = TERRITORY_BY_ID[action.from].adjacent.some(
      (territoryId) => territoryId !== action.to && state.territories[territoryId].ownerId !== playerId,
    );
    assertRule(
      canAttackWithGarrison(from.armies, to.armies, hasOtherEnemyBorder),
      hasOtherEnemyBorder && from.armies < 3
        ? "Da questo fronte non puoi attaccare: in caso di conquista non riusciresti a lasciare 2 armate contro l'altro nemico."
        : from.armies === 2
        ? "Con 2 armate puoi attaccare soltanto un territorio presidiato da 1 armata."
        : from.armies === 3
          ? "Con 3 armate puoi attaccare soltanto un territorio presidiato da 1 o 2 armate."
          : "Questo attacco non può essere effettuato.",
    );
    const dice = attackDiceForArmies(from.armies);
    assertRule(dice >= 1, "Servono almeno 2 armate per attaccare.");
    const battle = {
      attackerId: playerId,
      defenderId: to.ownerId,
      from: action.from,
      to: action.to,
      attackerDice: roll(dice),
      requestedDice: dice,
      createdAt: Date.now(),
    };
    state.pendingBattle = battle;
    if (actor.isBot) state.botAttacksThisTurn += 1;
    const defenseDice = defenseDiceForArmies(to.armies);
    assertRule(defenseDice >= 1, "Il territorio non ha armate con cui difendersi.");
    resolveBattle(state, roll(defenseDice));
    return state;
  }

  if (action.type === "moveAfterConquest") {
    const move = state.pendingMove;
    assertRule(move, "Non c'è uno spostamento da completare.");
    assertRule(move.playerId === playerId, "Non spetta a te spostare queste armate.");
    const amount = Math.floor(action.amount);
    assertRule(amount >= move.min && amount <= move.max, "Quantità di armate non valida.");
    const sourceAfterMove = state.territories[move.from].armies - amount;
    const sourceBordersEnemy = bordersEnemy(state, move.from, playerId);
    assertRule(
      !sourceBordersEnemy || sourceAfterMove >= 2,
      "Un territorio confinante con un nemico deve conservare almeno 2 armate.",
    );
    state.territories[move.from].armies -= amount;
    state.territories[move.to].armies += amount;
    state.pendingMove = undefined;
    if (!checkVictory(state, playerId) && actor.cards.length >= 5 && validTradeSets(actor.cards).length > 0) {
      state.phase = "reinforce";
      state.resumePhase = "attack";
      state.reinforcementPool = 0;
      logItem(state, `${actor.name} deve giocare un tris prima di proseguire gli attacchi.`, "cards");
    }
    return state;
  }

  if (action.type === "endAttack") {
    requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "attack", "Non è la fase d'attacco.");
    assertRule(!state.pendingBattle && !state.pendingMove, "Completa prima la battaglia in corso.");
    state.phase = "fortify";
    logItem(state, `${actor.name} conclude gli attacchi.`, "turn");
    return state;
  }

  if (action.type === "fortify") {
    requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "fortify", "Non è la fase di spostamento.");
    assertRule(!state.fortifyUsed, "Hai già effettuato lo spostamento strategico.");
    const from = state.territories[action.from];
    const to = state.territories[action.to];
    assertRule(from?.ownerId === playerId && to?.ownerId === playerId, "Entrambi i territori devono essere tuoi.");
    assertRule(action.from !== action.to, "Scegli due territori diversi.");
    assertRule(isConnectedThroughOwned(state, playerId, action.from, action.to), "I territori non sono collegati attraverso il tuo dominio.");
    const amount = Math.floor(action.amount);
    const minimumGarrison = bordersEnemy(state, action.from, playerId) ? 2 : 1;
    assertRule(
      amount > 0 && amount <= from.armies - minimumGarrison,
      minimumGarrison === 2
        ? "Il territorio confina con un nemico: devi lasciarvi almeno 2 armate."
        : "Devi lasciare almeno un'armata nel territorio di partenza.",
    );
    from.armies -= amount;
    to.armies += amount;
    state.fortifyUsed = true;
    logItem(state, `${actor.name} sposta ${amount} armate verso ${TERRITORY_BY_ID[action.to].name}.`, "turn");
    return state;
  }

  if (action.type === "endTurn") {
    const current = requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "fortify", "Devi prima concludere la fase d'attacco.");
    if (state.conqueredThisTurn) drawCard(state, current);
    if (!checkVictory(state, playerId) && !resolveTimedTurnEnd(state, playerId)) nextTurn(state);
    return state;
  }

  throw new GameRuleError("Azione non riconosciuta.");
};

export const sanitizeState = (state: GameState, meId: string): PublicGameState => {
  const normalized = structuredClone(state);
  normalizeRuntimeState(normalized);
  normalizeSetupTurn(normalized);
  const { deck, discard, ...publicState } = normalized;
  const revealAll = normalized.phase === "gameover";
  return {
    ...publicState,
    players: normalized.players.map((player) => {
      const publicPlayer = structuredClone(player);
      delete publicPlayer.profileId;
      delete publicPlayer.abandonedProfileId;
      return {
        ...publicPlayer,
        cards: player.id === meId || revealAll ? structuredClone(player.cards) : [],
        cardCount: player.cards.length,
        lastDrawnCard: player.id === meId ? structuredClone(player.lastDrawnCard) : undefined,
        lastDrawnAt: player.id === meId ? player.lastDrawnAt : undefined,
        objective: player.id === meId || revealAll ? structuredClone(player.objective) : undefined,
      };
    }),
    deckCount: deck.length,
    discardCount: discard.length,
  };
};

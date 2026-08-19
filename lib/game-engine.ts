import {
  CONTINENTS,
  PLAYER_COLORS,
  TERRITORIES,
  TERRITORY_BY_ID,
  type CardSymbol,
  type ContinentId,
  type TerritoryId,
} from "@/lib/game-data";
import type {
  GameAction,
  GamePlayer,
  GameSettings,
  GameState,
  Objective,
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
  host: { id: string; name: string },
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
      colorId: PLAYER_COLORS[0].id,
      color: PLAYER_COLORS[0].hex,
      status: "active",
      setupPool: 0,
      cards: [],
      stats: stats(),
    },
  ],
  territories: emptyTerritories(),
  reinforcementPool: 0,
  conqueredThisTurn: false,
  fortifyUsed: false,
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

export const addLobbyPlayer = (state: GameState, player: { id: string; name: string }) => {
  assertRule(state.phase === "lobby", "La partita è già iniziata.");
  assertRule(state.players.length < state.settings.maxPlayers, "La sala è al completo.");
  assertRule(
    !state.players.some((item) => item.name.toLocaleLowerCase("it") === player.name.toLocaleLowerCase("it")),
    "Questo nome è già usato nella sala.",
  );
  const color = PLAYER_COLORS[state.players.length];
  state.players.push({
    id: player.id,
    name: player.name,
    colorId: color.id,
    color: color.hex,
    status: "active",
    setupPool: 0,
    cards: [],
    stats: stats(),
  });
  logItem(state, `${player.name} è entrato nella sala.`);
};

const objectiveDefinitions = (state: GameState): Objective[] => {
  const objectives: Objective[] = [
    {
      id: "territories-24",
      title: "Grande espansione",
      description: "Conquista almeno 24 territori.",
    },
    {
      id: "strong-18",
      title: "Rete fortificata",
      description: "Controlla almeno 18 territori con almeno 2 armate ciascuno.",
    },
    {
      id: "north-america-africa",
      title: "Rotta atlantica",
      description: "Conquista interamente Nord America e Africa.",
    },
    {
      id: "north-america-oceania",
      title: "Dominio degli oceani",
      description: "Conquista interamente Nord America e Oceania.",
    },
    {
      id: "asia-south-america",
      title: "Due estremi",
      description: "Conquista interamente Asia e Sud America.",
    },
    {
      id: "europe-south-america-third",
      title: "Triplice alleanza",
      description: "Conquista Europa, Sud America e un terzo continente a scelta.",
    },
  ];

  if (state.players.length >= 3) {
    state.players.forEach((player, index) => {
      const target = state.players[(index + 1) % state.players.length];
      objectives.push({
        id: `eliminate-${target.id}`,
        title: "Operazione annientamento",
        description: `Elimina completamente l'armata di ${target.name}.`,
        targetPlayerId: target.id,
        fallback: "Se l'obiettivo non è più possibile, conquista 24 territori.",
      });
    });
  }

  return shuffle(objectives);
};

const initializeGame = (state: GameState) => {
  const players = state.players.filter((player) => player.status === "active");
  assertRule(players.length >= 2, "Servono almeno 2 giocatori per iniziare.");
  const shuffledTerritories = shuffle(TERRITORIES.map((territory) => territory.id));
  state.territories = emptyTerritories();
  state.turnOrder = shuffle(players.map((player) => player.id));
  state.turnIndex = 0;
  state.round = 1;
  state.currentPlayerId = undefined;
  state.phase = "setup";
  state.startedAt = Date.now();
  state.deadlineAt = state.settings.timeLimitMinutes
    ? state.startedAt + state.settings.timeLimitMinutes * 60_000
    : undefined;
  state.deck = createDeck();
  state.discard = [];
  state.reinforcementPool = 0;
  state.resumePhase = undefined;
  state.conqueredThisTurn = false;
  state.fortifyUsed = false;
  state.pendingBattle = undefined;
  state.pendingMove = undefined;
  state.lastBattle = undefined;
  state.winnerId = undefined;
  state.victoryReason = undefined;

  players.forEach((player) => {
    player.status = "active";
    player.eliminatedBy = undefined;
    player.cards = [];
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

  if (state.settings.mode === "dominio") {
    players.forEach((player) => {
      player.objective = {
        id: "world-domination",
        title: "Dominio globale",
        description: "Conquista tutti i 42 territori della mappa.",
      };
    });
  } else {
    const objectives = objectiveDefinitions(state);
    players.forEach((player, index) => {
      const candidate = objectives[index % objectives.length];
      player.objective =
        candidate.targetPlayerId === player.id
          ? objectives.find((objective) => !objective.targetPlayerId) ?? candidate
          : candidate;
    });
  }
  logItem(state, "I territori e gli obiettivi segreti sono stati assegnati.", "turn");
};

const allSetupComplete = (state: GameState) =>
  state.players.filter((player) => player.status === "active").every((player) => player.setupPool === 0);

const beginFirstTurn = (state: GameState) => {
  const firstId = state.turnOrder[0];
  state.currentPlayerId = firstId;
  state.turnIndex = 0;
  state.phase = "reinforce";
  state.reinforcementPool = reinforcementCount(state, firstId);
  logItem(
    state,
    `Inizia ${playerName(state, firstId)}: ${state.reinforcementPool} rinforzi disponibili.`,
    "turn",
  );
};

const drawCard = (state: GameState, player: GamePlayer) => {
  if (!state.deck.length && state.discard.length) {
    state.deck = shuffle(state.discard);
    state.discard = [];
  }
  const card = state.deck.pop();
  if (card) {
    player.cards.push(card);
    logItem(state, `${player.name} riceve una carta territorio.`, "cards");
  }
};

const tradeValue = (cards: TerritoryCard[]) => {
  if (cards.length !== 3) return 0;
  const wilds = cards.filter((card) => card.symbol === "jolly").length;
  const symbols = cards.filter((card) => card.symbol !== "jolly").map((card) => card.symbol);
  if (wilds === 0) {
    const unique = new Set(symbols);
    if (unique.size === 3) return 10;
    if (unique.size === 1) {
      const symbol = symbols[0] as Exclude<CardSymbol, "jolly">;
      return { fanteria: 4, cavalleria: 6, artiglieria: 8 }[symbol];
    }
  }
  if (wilds === 1 && new Set(symbols).size === 2) return 10;
  return 0;
};

export const validTradeSets = (cards: TerritoryCard[]) => {
  const sets: string[][] = [];
  for (let a = 0; a < cards.length - 2; a += 1) {
    for (let b = a + 1; b < cards.length - 1; b += 1) {
      for (let c = b + 1; c < cards.length; c += 1) {
        const selection = [cards[a], cards[b], cards[c]];
        if (tradeValue(selection)) sets.push(selection.map((card) => card.id));
      }
    }
  }
  return sets;
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

const objectiveMet = (state: GameState, player: GamePlayer) => {
  const owned = ownedTerritories(state, player.id);
  const objective = player.objective;
  if (!objective) return false;
  switch (objective.id) {
    case "world-domination":
      return owned.length === TERRITORIES.length;
    case "territories-24":
      return owned.length >= 24;
    case "strong-18":
      return owned.filter((territory) => state.territories[territory.id].armies >= 2).length >= 18;
    case "north-america-africa":
      return ownsContinent(state, player.id, "north-america") && ownsContinent(state, player.id, "africa");
    case "north-america-oceania":
      return ownsContinent(state, player.id, "north-america") && ownsContinent(state, player.id, "oceania");
    case "asia-south-america":
      return ownsContinent(state, player.id, "asia") && ownsContinent(state, player.id, "south-america");
    case "europe-south-america-third": {
      const ownedContinents = (Object.keys(CONTINENTS) as ContinentId[]).filter((continent) =>
        ownsContinent(state, player.id, continent),
      );
      return (
        ownedContinents.includes("europe") &&
        ownedContinents.includes("south-america") &&
        ownedContinents.length >= 3
      );
    }
    default:
      if (objective.id.startsWith("eliminate-") && objective.targetPlayerId) {
        const target = state.players.find((item) => item.id === objective.targetPlayerId);
        if (target?.status === "eliminated" && target.eliminatedBy === player.id) return true;
        if (target?.status !== "active" && target?.eliminatedBy !== player.id) return owned.length >= 24;
      }
      return false;
  }
};

const finishGame = (state: GameState, winnerId: string, reason: string) => {
  state.phase = "gameover";
  state.winnerId = winnerId;
  state.victoryReason = reason;
  state.pendingBattle = undefined;
  state.pendingMove = undefined;
  playerById(state, winnerId).stats.victories += 1;
  logItem(state, `${playerName(state, winnerId)} vince: ${reason}`, "victory");
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
  attacker.stats.territoriesConquered += 1;
  const max = from.armies - 1;
  const min = Math.max(1, Math.min(battle.requestedDice, max));
  state.pendingMove = { playerId: battle.attackerId, from: battle.from, to: battle.to, min, max };

  if (defeatedOwnerId !== NEUTRAL_ID && ownedTerritories(state, defeatedOwnerId).length === 0) {
    const eliminated = playerById(state, defeatedOwnerId);
    eliminated.status = "eliminated";
    eliminated.eliminatedBy = battle.attackerId;
    attacker.cards.push(...eliminated.cards);
    eliminated.cards = [];
    logItem(state, `${attacker.name} ha eliminato ${eliminated.name} e ne riceve le carte.`, "battle");
  }
};

const nextTurn = (state: GameState) => {
  const previousIndex = state.turnIndex;
  let nextIndex = previousIndex;
  do {
    nextIndex = (nextIndex + 1) % state.turnOrder.length;
  } while (playerById(state, state.turnOrder[nextIndex]).status !== "active" && nextIndex !== previousIndex);
  if (nextIndex <= previousIndex) state.round += 1;
  state.turnIndex = nextIndex;
  state.currentPlayerId = state.turnOrder[nextIndex];
  state.phase = "reinforce";
  state.resumePhase = undefined;
  state.reinforcementPool = reinforcementCount(state, state.currentPlayerId);
  state.conqueredThisTurn = false;
  state.fortifyUsed = false;
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

const claimTimeVictory = (state: GameState) => {
  assertRule(state.deadlineAt && Date.now() >= state.deadlineAt, "Il tempo non è ancora scaduto.");
  const ranked = state.players
    .filter((player) => player.status === "active")
    .map((player) => {
      const territories = ownedTerritories(state, player.id);
      const continents = (Object.keys(CONTINENTS) as ContinentId[]).filter((continent) =>
        ownsContinent(state, player.id, continent),
      );
      const armies = territories.reduce((sum, territory) => sum + state.territories[territory.id].armies, 0);
      const score = territories.length * 10 + continents.reduce((sum, id) => sum + CONTINENTS[id].bonus * 8, 0) + armies;
      return { player, score, territories: territories.length, armies };
    })
    .sort((a, b) => b.score - a.score || b.territories - a.territories || b.armies - a.armies);
  finishGame(state, ranked[0].player.id, `miglior dominio allo scadere del tempo (${ranked[0].score} punti).`);
};

export const applyGameAction = (original: GameState, playerId: string, action: GameAction): GameState => {
  const state = structuredClone(original);
  const actor = playerById(state, playerId);

  if (action.type === "sendMessage") {
    const text = action.text.trim().replace(/\s+/g, " ").slice(0, 180);
    assertRule(text.length > 0, "Scrivi un messaggio.");
    state.messages.push({ id: makeId("msg"), playerId, text, at: Date.now() });
    state.messages = state.messages.slice(-60);
    return state;
  }

  if (action.type === "updateSettings") {
    assertRule(state.phase === "lobby", "Le impostazioni sono bloccate dopo l'inizio.");
    assertRule(state.hostId === playerId, "Solo chi ospita può cambiare le impostazioni.");
    const next = { ...state.settings, ...action.settings };
    assertRule([2, 3, 4, 5, 6].includes(next.maxPlayers), "Numero di giocatori non valido.");
    assertRule(next.maxPlayers >= state.players.length, "Il limite è inferiore ai giocatori presenti.");
    assertRule([0, 45, 60, 90].includes(next.timeLimitMinutes), "Durata non valida.");
    assertRule(["missioni", "dominio"].includes(next.mode), "Modalità non valida.");
    state.settings = next;
    logItem(state, `${actor.name} ha aggiornato le regole della sala.`);
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

  if (action.type === "rematch") {
    assertRule(state.phase === "gameover", "La rivincita è disponibile a partita conclusa.");
    assertRule(state.hostId === playerId, "Solo chi ospita può avviare la rivincita.");
    initializeGame(state);
    logItem(state, `${actor.name} ha avviato una rivincita.`, "turn");
    return state;
  }

  if (action.type === "resign") {
    if (state.phase === "lobby") {
      assertRule(playerId !== state.hostId, "Chi ospita non può abbandonare la propria sala.");
      state.players = state.players.filter((player) => player.id !== playerId);
      logItem(state, `${actor.name} ha lasciato la sala.`);
      return state;
    }
    assertRule(actor.status === "active", "Hai già abbandonato la partita.");
    actor.status = "resigned";
    TERRITORIES.forEach((territory) => {
      if (state.territories[territory.id].ownerId === playerId) {
        state.territories[territory.id].ownerId = NEUTRAL_ID;
      }
    });
    if (state.pendingBattle?.attackerId === playerId || state.pendingBattle?.defenderId === playerId) {
      state.pendingBattle = undefined;
    }
    if (state.pendingMove?.playerId === playerId) state.pendingMove = undefined;
    logItem(state, `${actor.name} ha abbandonato la partita.`, "system");
    const active = state.players.filter((player) => player.status === "active");
    if (active.length === 1) finishGame(state, active[0].id, "è l'ultima armata rimasta sulla mappa.");
    else if (state.currentPlayerId === playerId) nextTurn(state);
    return state;
  }

  if (action.type === "claimTimeVictory") {
    assertRule(state.phase !== "lobby" && state.phase !== "gameover", "La partita non è in corso.");
    claimTimeVictory(state);
    return state;
  }

  if (action.type === "placeSetup") {
    assertRule(state.phase === "setup", "La fase di schieramento è terminata.");
    assertRule(actor.status === "active", "Non sei più in partita.");
    const territory = state.territories[action.territoryId];
    assertRule(territory?.ownerId === playerId, "Puoi schierare solo nei tuoi territori.");
    const amount = Math.floor(action.amount);
    assertRule(amount > 0 && amount <= actor.setupPool, "Quantità di armate non valida.");
    territory.armies += amount;
    actor.setupPool -= amount;
    if (allSetupComplete(state)) beginFirstTurn(state);
    return state;
  }

  if (action.type === "autoSetup") {
    assertRule(state.phase === "setup", "La fase di schieramento è terminata.");
    assertRule(actor.setupPool > 0, "Hai già schierato tutte le armate.");
    const owned = ownedTerritories(state, playerId);
    while (actor.setupPool > 0) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      state.territories[owned[random[0] % owned.length].id].armies += 1;
      actor.setupPool -= 1;
    }
    logItem(state, `${actor.name} ha completato lo schieramento iniziale.`);
    if (allSetupComplete(state)) beginFirstTurn(state);
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
    requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "reinforce", "Non è il momento di schierare rinforzi.");
    const territory = state.territories[action.territoryId];
    assertRule(territory?.ownerId === playerId, "Puoi rinforzare solo i tuoi territori.");
    const amount = Math.floor(action.amount);
    assertRule(amount > 0 && amount <= state.reinforcementPool, "Quantità di armate non valida.");
    territory.armies += amount;
    state.reinforcementPool -= amount;
    return state;
  }

  if (action.type === "beginAttack") {
    const current = requireCurrentPlayer(state, playerId);
    assertRule(state.phase === "reinforce", "La fase d'attacco è già iniziata.");
    assertRule(state.reinforcementPool === 0, "Devi prima schierare tutti i rinforzi.");
    assertRule(current.cards.length < 5 || validTradeSets(current.cards).length === 0, "Con 5 o più carte devi giocare un tris.");
    state.phase = state.resumePhase ?? "attack";
    state.resumePhase = undefined;
    logItem(state, `${current.name} passa alla fase d'attacco.`, "turn");
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
    const maxDice = Math.min(3, from.armies - 1);
    const dice = Math.floor(action.dice);
    assertRule(dice >= 1 && dice <= maxDice, "Numero di dadi d'attacco non valido.");
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
    if (to.ownerId === NEUTRAL_ID) resolveBattle(state, roll(Math.min(3, to.armies)));
    return state;
  }

  if (action.type === "defend") {
    const battle = state.pendingBattle;
    assertRule(battle, "Non c'è un attacco da difendere.");
    assertRule(battle.defenderId === playerId, "Questo attacco non è diretto contro di te.");
    const territory = state.territories[battle.to];
    const dice = Math.floor(action.dice);
    assertRule(dice >= 1 && dice <= Math.min(3, territory.armies), "Numero di dadi di difesa non valido.");
    resolveBattle(state, roll(dice));
    return state;
  }

  if (action.type === "moveAfterConquest") {
    const move = state.pendingMove;
    assertRule(move, "Non c'è uno spostamento da completare.");
    assertRule(move.playerId === playerId, "Non spetta a te spostare queste armate.");
    const amount = Math.floor(action.amount);
    assertRule(amount >= move.min && amount <= move.max, "Quantità di armate non valida.");
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
    assertRule(amount > 0 && amount < from.armies, "Devi lasciare almeno un'armata nel territorio di partenza.");
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
    if (!checkVictory(state, playerId)) nextTurn(state);
    return state;
  }

  throw new GameRuleError("Azione non riconosciuta.");
};

export const sanitizeState = (state: GameState, meId: string): PublicGameState => {
  const { deck, discard, ...publicState } = structuredClone(state);
  const revealAll = state.phase === "gameover";
  return {
    ...publicState,
    players: state.players.map((player) => ({
      ...structuredClone(player),
      cards: player.id === meId || revealAll ? structuredClone(player.cards) : [],
      cardCount: player.cards.length,
      objective: player.id === meId || revealAll ? structuredClone(player.objective) : undefined,
    })),
    deckCount: deck.length,
    discardCount: discard.length,
  };
};

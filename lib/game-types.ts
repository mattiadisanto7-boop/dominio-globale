import type { CardSymbol, ContinentId, TerritoryId } from "@/lib/game-data";

export type GamePhase =
  | "lobby"
  | "setup"
  | "reinforce"
  | "attack"
  | "fortify"
  | "gameover";

export type GameMode = "missioni";

export type PlayerStatus = "active" | "eliminated" | "resigned";

export type TerritoryCard = {
  id: string;
  territoryId?: TerritoryId;
  symbol: CardSymbol;
};

export type Objective = {
  id: string;
  title: string;
  description: string;
  number: number;
  points: 86;
  territoryIds: TerritoryId[];
};

export type PlayerStats = {
  attacks: number;
  victories: number;
  territoriesConquered: number;
  armiesLost: number;
  armiesDefeated: number;
  setsTraded: number;
};

export type GamePlayer = {
  id: string;
  name: string;
  profileId?: string;
  abandonedProfileId?: string;
  isBot?: boolean;
  abandoned?: boolean;
  colorId: string;
  color: string;
  status: PlayerStatus;
  eliminatedBy?: string;
  setupPool: number;
  cards: TerritoryCard[];
  lastDrawnCard?: TerritoryCard;
  lastDrawnAt?: number;
  objective?: Objective;
  stats: PlayerStats;
};

export type TerritoryState = {
  ownerId: string;
  armies: number;
};

export type BattleState = {
  attackerId: string;
  defenderId: string;
  from: TerritoryId;
  to: TerritoryId;
  attackerDice: number[];
  requestedDice: number;
  createdAt: number;
};

export type MoveAfterConquest = {
  playerId: string;
  from: TerritoryId;
  to: TerritoryId;
  min: number;
  max: number;
  sourceMinimum: 1 | 2;
  forcedException: boolean;
};

export type BattleReport = {
  from: TerritoryId;
  to: TerritoryId;
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  conquered: boolean;
  at: number;
};

export type ContinentConquestReport = {
  playerId: string;
  continent: ContinentId;
  at: number;
};

export type TimedEndgameStage = "running" | "penultimate" | "last-round" | "sudden-death";

export type TimedEndgameState = {
  stage: TimedEndgameStage;
  activatedAt?: number;
  threshold: 4 | 5 | 6 | 7;
  turnsAtThreshold: number;
};

export type SuddenDeathReport = {
  playerId: string;
  dice?: [number, number];
  total?: number;
  threshold: 4 | 5 | 6 | 7;
  closed: boolean;
  skipped: boolean;
  conqueredTerritories: number;
  at: number;
};

export type GameLogItem = {
  id: string;
  at: number;
  kind: "system" | "battle" | "turn" | "cards" | "victory";
  text: string;
};

export type ChatMessage = {
  id: string;
  playerId: string;
  text: string;
  at: number;
};

export type GameSettings = {
  maxPlayers: 2 | 3 | 4 | 5 | 6;
  mode: GameMode;
  timeLimitMinutes: 0 | 45 | 60 | 90;
  defense: "automatic" | "interactive";
  visibility?: "public" | "private";
};

export type GameState = {
  code: string;
  hostId: string;
  phase: GamePhase;
  settings: GameSettings;
  createdAt: number;
  matchId?: string;
  startedAt?: number;
  deadlineAt?: number;
  timedEndgame?: TimedEndgameState;
  turnOrder: string[];
  turnIndex: number;
  round: number;
  currentPlayerId?: string;
  players: GamePlayer[];
  territories: Record<TerritoryId, TerritoryState>;
  setupBatchRemaining: number;
  reinforcementPool: number;
  resumePhase?: "attack";
  conqueredThisTurn: boolean;
  territoriesConqueredThisTurn: number;
  fortifyUsed: boolean;
  botAttacksThisTurn: number;
  pendingBattle?: BattleState;
  pendingMove?: MoveAfterConquest;
  lastBattle?: BattleReport;
  lastContinentConquest?: ContinentConquestReport;
  lastSuddenDeath?: SuddenDeathReport;
  deck: TerritoryCard[];
  discard: TerritoryCard[];
  log: GameLogItem[];
  messages: ChatMessage[];
  winnerId?: string;
  victoryReason?: string;
};

export type PublicPlayer = Omit<GamePlayer, "cards" | "objective" | "profileId" | "abandonedProfileId"> & {
  cards: TerritoryCard[];
  cardCount: number;
  objective?: Objective;
};

export type PublicGameState = Omit<GameState, "players" | "deck" | "discard"> & {
  players: PublicPlayer[];
  deckCount: number;
  discardCount: number;
};

export type RoomEnvelope = {
  version: number;
  meId: string;
  role: "player" | "spectator";
  spectatorCount: number;
  state: PublicGameState;
};

export type GameAction =
  | { type: "updateSettings"; settings: Partial<GameSettings> }
  | { type: "chooseColor"; colorId: string }
  | { type: "fillWithBots" }
  | { type: "startGame" }
  | { type: "kickPlayer"; playerId: string }
  | { type: "placeSetup"; territoryId: TerritoryId }
  | { type: "autoSetup" }
  | { type: "deploy"; territoryId: TerritoryId; amount: number }
  | { type: "tradeCards"; cardIds: string[] }
  | { type: "beginAttack" }
  | { type: "attack"; from: TerritoryId; to: TerritoryId }
  | { type: "moveAfterConquest"; amount: number }
  | { type: "endAttack" }
  | { type: "fortify"; from: TerritoryId; to: TerritoryId; amount: number }
  | { type: "endTurn" }
  | { type: "sendMessage"; text: string }
  | { type: "advanceBot" }
  | { type: "resign" }
  | { type: "rematch" };

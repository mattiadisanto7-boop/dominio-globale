import type { TerritoryId } from "@/lib/game-data";
import type { Objective } from "@/lib/game-types";

type TournamentObjective = Omit<Objective, "territoryIds"> & {
  territoryIds: TerritoryId[];
};

const northAmerica: TerritoryId[] = [
  "alaska", "northwest-territory", "greenland", "alberta", "ontario", "quebec",
  "western-united-states", "eastern-united-states", "central-america",
];
const southAmerica: TerritoryId[] = ["venezuela", "peru", "brazil", "argentina"];
const europe: TerritoryId[] = [
  "iceland", "great-britain", "scandinavia", "northern-europe", "western-europe",
  "southern-europe", "ukraine",
];
const africa: TerritoryId[] = [
  "north-africa", "egypt", "east-africa", "congo", "south-africa", "madagascar",
];
const asia: TerritoryId[] = [
  "ural", "siberia", "yakutsk", "kamchatka", "irkutsk", "mongolia", "japan",
  "afghanistan", "middle-east", "india", "china", "siam",
];
const oceania: TerritoryId[] = [
  "indonesia", "new-guinea", "western-australia", "eastern-australia",
];

const card = (number: number, territoryIds: TerritoryId[]): TournamentObjective => ({
  id: `challenge-${number}`,
  number,
  points: 86,
  title: `Obiettivo ${number}`,
  description: "Conquista tutti i territori evidenziati in rosso sulla carta.",
  territoryIds,
});

/**
 * Le sole 16 carte obiettivo del tabellone Challenge inviato dall'utente.
 * Ogni carta contiene territori connessi e vale esattamente 86 punti-confine.
 */
export const TOURNAMENT_OBJECTIVES: TournamentObjective[] = [
  card(1, [
    ...northAmerica, ...southAmerica,
    "north-africa", "egypt", "east-africa", "congo",
    "middle-east", "india", "siam",
    "indonesia", "new-guinea", "western-australia",
  ]),
  card(2, [
    "greenland", "ontario", "quebec", "eastern-united-states",
    ...europe, ...africa,
    "ural", "afghanistan", "middle-east",
  ]),
  card(3, [
    ...europe, ...africa,
    "ural", "afghanistan", "middle-east", "india", "siam",
    ...oceania,
  ]),
  card(4, [
    ...northAmerica,
    "iceland", "great-britain", "scandinavia", "northern-europe", "southern-europe", "ukraine",
    ...africa,
  ]),
  card(5, [
    ...northAmerica,
    "iceland", "scandinavia", "ukraine",
    "ural", "afghanistan", "middle-east", "india", "china", "siam",
    ...oceania,
  ]),
  card(6, [
    ...southAmerica,
    "great-britain", "scandinavia", "northern-europe", "western-europe", "southern-europe", "ukraine",
    "north-africa", "egypt", "east-africa", "congo",
    "afghanistan", "middle-east", "india", "siam",
    ...oceania,
  ]),
  card(7, [...southAmerica, ...africa, ...asia]),
  card(8, [...northAmerica, ...southAmerica, ...europe, "kamchatka", "japan"]),
  card(9, [...europe, ...asia, "indonesia"]),
  card(10, [
    ...northAmerica, ...europe,
    "ural", "siberia", "yakutsk", "kamchatka", "japan",
  ]),
  card(11, [
    ...southAmerica, ...europe, ...africa,
    "ural", "siberia", "afghanistan", "middle-east",
  ]),
  card(12, [...africa, ...asia, "southern-europe", "ukraine"]),
  card(13, [...northAmerica, ...asia]),
  card(14, [
    ...southAmerica,
    "western-europe", "southern-europe",
    ...africa,
    "irkutsk", "mongolia", "japan", "middle-east", "india", "china", "siam",
    ...oceania,
  ]),
  card(15, [
    "alaska", "alberta",
    "egypt", "east-africa", "congo", "south-africa", "madagascar",
    ...asia, ...oceania,
  ]),
  card(16, [
    ...northAmerica, ...southAmerica,
    "western-europe", "southern-europe", "ukraine",
    ...africa,
  ]),
];

export const objectiveProgress = (
  objective: Objective | undefined,
  ownerOf: (territoryId: TerritoryId) => string,
  playerId: string,
) => {
  if (!objective) return { owned: 0, total: 0 };
  return {
    owned: objective.territoryIds.filter((territoryId) => ownerOf(territoryId) === playerId).length,
    total: objective.territoryIds.length,
  };
};

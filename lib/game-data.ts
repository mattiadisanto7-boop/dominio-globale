export type ContinentId =
  | "north-america"
  | "south-america"
  | "europe"
  | "africa"
  | "asia"
  | "oceania";

export type TerritoryId =
  | "alaska"
  | "northwest-territory"
  | "greenland"
  | "alberta"
  | "ontario"
  | "quebec"
  | "western-united-states"
  | "eastern-united-states"
  | "central-america"
  | "venezuela"
  | "peru"
  | "brazil"
  | "argentina"
  | "iceland"
  | "great-britain"
  | "scandinavia"
  | "northern-europe"
  | "western-europe"
  | "southern-europe"
  | "ukraine"
  | "north-africa"
  | "egypt"
  | "east-africa"
  | "congo"
  | "south-africa"
  | "madagascar"
  | "ural"
  | "siberia"
  | "yakutsk"
  | "kamchatka"
  | "irkutsk"
  | "mongolia"
  | "japan"
  | "afghanistan"
  | "middle-east"
  | "india"
  | "china"
  | "siam"
  | "indonesia"
  | "new-guinea"
  | "western-australia"
  | "eastern-australia";

export type CardSymbol = "fanteria" | "cavalleria" | "artiglieria" | "jolly";

export type TerritoryDefinition = {
  id: TerritoryId;
  name: string;
  short: string;
  continent: ContinentId;
  x: number;
  y: number;
  adjacent: TerritoryId[];
  symbol: Exclude<CardSymbol, "jolly">;
};

export const CONTINENTS: Record<
  ContinentId,
  { name: string; bonus: number; color: string }
> = {
  "north-america": { name: "Nord America", bonus: 5, color: "#4e9bb5" },
  "south-america": { name: "Sud America", bonus: 2, color: "#ba7b4a" },
  europe: { name: "Europa", bonus: 5, color: "#9a75b7" },
  africa: { name: "Africa", bonus: 3, color: "#cf9d42" },
  asia: { name: "Asia", bonus: 7, color: "#7da56a" },
  oceania: { name: "Oceania", bonus: 2, color: "#b56f72" },
};

const t = (
  id: TerritoryId,
  name: string,
  short: string,
  continent: ContinentId,
  x: number,
  y: number,
  adjacent: TerritoryId[],
  symbol: Exclude<CardSymbol, "jolly">,
): TerritoryDefinition => ({ id, name, short, continent, x, y, adjacent, symbol });

export const TERRITORIES: TerritoryDefinition[] = [
  t("alaska", "Alaska", "ALA", "north-america", 74, 106, ["northwest-territory", "alberta", "kamchatka"], "fanteria"),
  t("northwest-territory", "Territori del Nord-Ovest", "TNO", "north-america", 168, 92, ["alaska", "alberta", "ontario", "greenland"], "cavalleria"),
  t("greenland", "Groenlandia", "GRO", "north-america", 293, 76, ["northwest-territory", "ontario", "quebec", "iceland"], "artiglieria"),
  t("alberta", "Alberta", "ALB", "north-america", 150, 164, ["alaska", "northwest-territory", "ontario", "western-united-states"], "fanteria"),
  t("ontario", "Ontario", "ONT", "north-america", 230, 162, ["northwest-territory", "greenland", "quebec", "eastern-united-states", "western-united-states", "alberta"], "cavalleria"),
  t("quebec", "Québec", "QUE", "north-america", 306, 170, ["greenland", "ontario", "eastern-united-states"], "artiglieria"),
  t("western-united-states", "Stati Uniti Occidentali", "SUO", "north-america", 165, 239, ["alberta", "ontario", "eastern-united-states", "central-america"], "fanteria"),
  t("eastern-united-states", "Stati Uniti Orientali", "SUE", "north-america", 260, 238, ["ontario", "quebec", "western-united-states", "central-america"], "cavalleria"),
  t("central-america", "America Centrale", "AMC", "north-america", 215, 308, ["western-united-states", "eastern-united-states", "venezuela"], "artiglieria"),

  t("venezuela", "Venezuela", "VEN", "south-america", 270, 370, ["central-america", "peru", "brazil"], "fanteria"),
  t("peru", "Perù", "PER", "south-america", 258, 453, ["venezuela", "brazil", "argentina"], "cavalleria"),
  t("brazil", "Brasile", "BRA", "south-america", 340, 424, ["venezuela", "peru", "argentina", "north-africa"], "artiglieria"),
  t("argentina", "Argentina", "ARG", "south-america", 292, 545, ["peru", "brazil"], "fanteria"),

  t("iceland", "Islanda", "ISL", "europe", 468, 104, ["greenland", "great-britain", "scandinavia"], "cavalleria"),
  t("great-britain", "Gran Bretagna", "GBR", "europe", 472, 177, ["iceland", "scandinavia", "northern-europe", "western-europe"], "artiglieria"),
  t("scandinavia", "Scandinavia", "SCA", "europe", 555, 116, ["iceland", "great-britain", "northern-europe", "ukraine"], "fanteria"),
  t("northern-europe", "Europa Settentrionale", "ESE", "europe", 553, 190, ["great-britain", "scandinavia", "ukraine", "southern-europe", "western-europe"], "cavalleria"),
  t("western-europe", "Europa Occidentale", "EOC", "europe", 485, 256, ["great-britain", "northern-europe", "southern-europe", "north-africa"], "artiglieria"),
  t("southern-europe", "Europa Meridionale", "EME", "europe", 578, 258, ["western-europe", "northern-europe", "ukraine", "middle-east", "egypt", "north-africa"], "fanteria"),
  t("ukraine", "Ucraina", "UCR", "europe", 650, 171, ["scandinavia", "northern-europe", "southern-europe", "middle-east", "afghanistan", "ural"], "cavalleria"),

  t("north-africa", "Africa del Nord", "AFN", "africa", 520, 342, ["brazil", "western-europe", "southern-europe", "egypt", "east-africa", "congo"], "artiglieria"),
  t("egypt", "Egitto", "EGI", "africa", 610, 326, ["north-africa", "southern-europe", "middle-east", "east-africa"], "fanteria"),
  t("east-africa", "Africa Orientale", "AFO", "africa", 635, 415, ["egypt", "north-africa", "congo", "south-africa", "madagascar", "middle-east"], "cavalleria"),
  t("congo", "Congo", "CON", "africa", 548, 433, ["north-africa", "east-africa", "south-africa"], "artiglieria"),
  t("south-africa", "Africa del Sud", "AFS", "africa", 580, 535, ["congo", "east-africa", "madagascar"], "fanteria"),
  t("madagascar", "Madagascar", "MAD", "africa", 680, 530, ["south-africa", "east-africa"], "cavalleria"),

  t("ural", "Urali", "URA", "asia", 731, 125, ["ukraine", "afghanistan", "china", "siberia"], "artiglieria"),
  t("siberia", "Siberia", "SIB", "asia", 813, 91, ["ural", "china", "mongolia", "irkutsk", "yakutsk"], "fanteria"),
  t("yakutsk", "Jacuzia", "JAC", "asia", 905, 78, ["siberia", "irkutsk", "kamchatka"], "cavalleria"),
  t("kamchatka", "Kamchatka", "KAM", "asia", 1017, 104, ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"], "artiglieria"),
  t("irkutsk", "Irkutsk", "IRK", "asia", 884, 154, ["siberia", "yakutsk", "kamchatka", "mongolia"], "fanteria"),
  t("mongolia", "Mongolia", "MON", "asia", 890, 224, ["siberia", "irkutsk", "kamchatka", "japan", "china"], "cavalleria"),
  t("japan", "Giappone", "GIA", "asia", 1013, 239, ["kamchatka", "mongolia"], "artiglieria"),
  t("afghanistan", "Afghanistan", "AFG", "asia", 716, 220, ["ukraine", "ural", "china", "india", "middle-east"], "fanteria"),
  t("middle-east", "Medio Oriente", "MOR", "asia", 678, 288, ["southern-europe", "ukraine", "afghanistan", "india", "east-africa", "egypt"], "cavalleria"),
  t("india", "India", "IND", "asia", 775, 304, ["middle-east", "afghanistan", "china", "siam"], "artiglieria"),
  t("china", "Cina", "CIN", "asia", 835, 245, ["ural", "siberia", "mongolia", "siam", "india", "afghanistan"], "fanteria"),
  t("siam", "Siam", "SIA", "asia", 865, 351, ["india", "china", "indonesia"], "cavalleria"),

  t("indonesia", "Indonesia", "IDO", "oceania", 876, 439, ["siam", "new-guinea", "western-australia"], "artiglieria"),
  t("new-guinea", "Nuova Guinea", "NGU", "oceania", 995, 433, ["indonesia", "western-australia", "eastern-australia"], "fanteria"),
  t("western-australia", "Australia Occidentale", "AOC", "oceania", 903, 535, ["indonesia", "new-guinea", "eastern-australia"], "cavalleria"),
  t("eastern-australia", "Australia Orientale", "AOR", "oceania", 1007, 539, ["western-australia", "new-guinea"], "artiglieria"),
];

export const TERRITORY_BY_ID = Object.fromEntries(
  TERRITORIES.map((territory) => [territory.id, territory]),
) as Record<TerritoryId, TerritoryDefinition>;

export const PLAYER_COLORS = [
  { id: "rubino", name: "Rubino", hex: "#ef5058" },
  { id: "zaffiro", name: "Zaffiro", hex: "#4d8dff" },
  { id: "smeraldo", name: "Smeraldo", hex: "#43c988" },
  { id: "ambra", name: "Ambra", hex: "#f1ad42" },
  { id: "ametista", name: "Ametista", hex: "#9a6cff" },
  { id: "avorio", name: "Avorio", hex: "#e7e2d4" },
] as const;

export const INTERCONTINENTAL_ROUTES: [TerritoryId, TerritoryId][] = [
  ["alaska", "kamchatka"],
  ["greenland", "iceland"],
  ["brazil", "north-africa"],
  ["central-america", "venezuela"],
  ["southern-europe", "north-africa"],
  ["southern-europe", "middle-east"],
  ["egypt", "middle-east"],
  ["east-africa", "middle-east"],
  ["siam", "indonesia"],
];

export const SYMBOL_LABELS: Record<CardSymbol, string> = {
  fanteria: "Fanteria",
  cavalleria: "Cavalleria",
  artiglieria: "Artiglieria",
  jolly: "Jolly",
};


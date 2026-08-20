import type { TerritoryCard } from "@/lib/game-types";

export const cardTradeValue = (cards: TerritoryCard[]) => {
  if (cards.length !== 3) return 0;
  const wilds = cards.filter((card) => card.symbol === "jolly").length;
  const symbols = cards.filter((card) => card.symbol !== "jolly").map((card) => card.symbol);
  if (!wilds && new Set(symbols).size === 1) return 8;
  if (!wilds && new Set(symbols).size === 3) return 10;
  if (wilds === 1 && symbols.length === 2 && new Set(symbols).size === 1) return 12;
  return 0;
};

export const validCardTradeSets = (cards: TerritoryCard[]) => {
  const sets: string[][] = [];
  for (let first = 0; first < cards.length - 2; first += 1) {
    for (let second = first + 1; second < cards.length - 1; second += 1) {
      for (let third = second + 1; third < cards.length; third += 1) {
        const selection = [cards[first], cards[second], cards[third]];
        if (cardTradeValue(selection)) sets.push(selection.map((card) => card.id));
      }
    }
  }
  return sets;
};

export const mustTradeCards = (cards: TerritoryCard[]) =>
  cards.length >= 5 && validCardTradeSets(cards).length > 0;

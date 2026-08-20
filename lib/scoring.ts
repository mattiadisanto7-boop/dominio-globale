import type { PlayerStats } from "@/lib/game-types";

export const dominionPointsForPerformance = ({
  won,
  abandoned,
  objectiveScore,
  stats,
}: {
  won: boolean;
  abandoned?: boolean;
  objectiveScore: number;
  stats: PlayerStats;
}) => {
  const performance =
    Math.max(0, objectiveScore) +
    stats.territoriesConquered * 2 +
    Math.floor(stats.armiesDefeated / 3) +
    stats.setsTraded * 3;
  if (abandoned) return Math.max(0, performance - 20);
  return (won ? 100 : 20) + performance;
};

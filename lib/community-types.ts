import type { GamePhase, GameSettings } from "@/lib/game-types";

export type PublicProfile = {
  id: string;
  nickname: string;
  createdAt: number;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  totalAttacks: number;
  territoriesConquered: number;
  armiesDefeated: number;
  setsTraded: number;
  bestObjectiveScore: number;
};

export type OnlineProfile = Pick<PublicProfile, "id" | "nickname" | "rating"> & {
  presence: "home" | "playing" | "spectating";
  lastSeenAt: number;
};

export type PublicRoomSummary = {
  code: string;
  hostName: string;
  phase: GamePhase;
  players: number;
  humans: number;
  bots: number;
  maxPlayers: GameSettings["maxPlayers"];
  timeLimitMinutes: GameSettings["timeLimitMinutes"];
  spectators: number;
  createdAt: number;
  startedAt?: number;
};

export type CommunitySnapshot = {
  generatedAt: number;
  rooms: PublicRoomSummary[];
  online: OnlineProfile[];
  leaderboard: PublicProfile[];
};

export type AccountEnvelope = {
  token: string;
  profile: PublicProfile;
};

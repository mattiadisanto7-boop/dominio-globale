import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool, type PoolClient } from "pg";
import { TERRITORY_BY_ID } from "@/lib/game-data";
import type {
  CommunitySnapshot,
  OnlineProfile,
  PublicProfile,
  PublicRoomSummary,
} from "@/lib/community-types";
import type { GameState } from "@/lib/game-types";

export class StoreConflictError extends Error {
  constructor() {
    super("La partita è cambiata su un altro dispositivo. Aggiorno la situazione.");
    this.name = "StoreConflictError";
  }
}

export type StoredGame = {
  state: GameState;
  version: number;
};

export type RoomMemberRole = "player" | "spectator";

export type AuthenticatedRoomMember = {
  id: string;
  role: RoomMemberRole;
  profileId?: string;
};

const scrypt = promisify(scryptCallback);

type GlobalWithPool = typeof globalThis & { dominioGlobalePool?: Pool };
const globalWithPool = globalThis as GlobalWithPool;

const database = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL non configurato. Collega un database PostgreSQL.");
  }

  if (!globalWithPool.dominioGlobalePool) {
    const sslRequested = process.env.DATABASE_SSL === "true";
    globalWithPool.dominioGlobalePool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: sslRequested ? { rejectUnauthorized: false } : undefined,
    });
  }

  return globalWithPool.dominioGlobalePool;
};

let initialization: Promise<void> | undefined;

const ensureDatabase = async () => {
  if (!initialization) {
    initialization = database()
      .query(`
        CREATE TABLE IF NOT EXISTS games (
          code TEXT PRIMARY KEY,
          host_player_id TEXT NOT NULL,
          state JSONB NOT NULL,
          status TEXT NOT NULL DEFAULT 'lobby',
          version INTEGER NOT NULL DEFAULT 1,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS games_updated_at_idx ON games (updated_at);

        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          nickname TEXT NOT NULL,
          nickname_key TEXT NOT NULL UNIQUE,
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          last_seen_at BIGINT NOT NULL,
          presence_status TEXT NOT NULL DEFAULT 'home',
          current_room_code TEXT,
          rating INTEGER NOT NULL DEFAULT 1000,
          games_played INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0,
          losses INTEGER NOT NULL DEFAULT 0,
          total_attacks INTEGER NOT NULL DEFAULT 0,
          territories_conquered INTEGER NOT NULL DEFAULT 0,
          armies_defeated INTEGER NOT NULL DEFAULT 0,
          sets_traded INTEGER NOT NULL DEFAULT 0,
          best_objective_score INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS profile_sessions (
          token_hash TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          last_seen_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS profile_sessions_profile_idx
          ON profile_sessions (profile_id);

        CREATE TABLE IF NOT EXISTS room_players (
          id TEXT PRIMARY KEY,
          game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          joined_at BIGINT NOT NULL,
          role TEXT NOT NULL DEFAULT 'player',
          profile_id TEXT,
          last_seen_at BIGINT
        );

        ALTER TABLE room_players ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
        ALTER TABLE room_players ADD COLUMN IF NOT EXISTS profile_id TEXT;
        ALTER TABLE room_players ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;

        CREATE INDEX IF NOT EXISTS room_players_game_code_idx
          ON room_players (game_code);
        CREATE INDEX IF NOT EXISTS room_players_token_idx
          ON room_players (game_code, token_hash);
        CREATE INDEX IF NOT EXISTS room_players_profile_idx
          ON room_players (game_code, profile_id);

        CREATE TABLE IF NOT EXISTS game_results (
          game_code TEXT NOT NULL,
          match_id TEXT NOT NULL,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          won BOOLEAN NOT NULL,
          objective_score INTEGER NOT NULL,
          rating_delta INTEGER NOT NULL,
          recorded_at BIGINT NOT NULL,
          PRIMARY KEY (game_code, match_id, profile_id)
        );

        CREATE INDEX IF NOT EXISTS profiles_leaderboard_idx
          ON profiles (rating DESC, wins DESC);
        CREATE INDEX IF NOT EXISTS profiles_online_idx
          ON profiles (last_seen_at DESC);
      `)
      .then(() => undefined)
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
  }
  await initialization;
};

const inTransaction = async <T>(operation: (client: PoolClient) => Promise<T>) => {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const createSecretToken = () =>
  `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;

export const hashToken = async (token: string) => {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

type ProfileRow = {
  id: string;
  nickname: string;
  created_at: number | string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  total_attacks: number;
  territories_conquered: number;
  armies_defeated: number;
  sets_traded: number;
  best_objective_score: number;
};

type PrivateProfileRow = ProfileRow & {
  password_salt: string;
  password_hash: string;
};

const toPublicProfile = (row: ProfileRow): PublicProfile => ({
  id: row.id,
  nickname: row.nickname,
  createdAt: Number(row.created_at),
  rating: Number(row.rating),
  gamesPlayed: Number(row.games_played),
  wins: Number(row.wins),
  losses: Number(row.losses),
  totalAttacks: Number(row.total_attacks),
  territoriesConquered: Number(row.territories_conquered),
  armiesDefeated: Number(row.armies_defeated),
  setsTraded: Number(row.sets_traded),
  bestObjectiveScore: Number(row.best_objective_score),
});

const derivePassword = async (password: string, salt: string) =>
  (await scrypt(password, salt, 64)) as Buffer;

const profileColumns = `
  id, nickname, created_at, rating, games_played, wins, losses,
  total_attacks, territories_conquered, armies_defeated, sets_traded,
  best_objective_score
`;

export const createProfile = async (nickname: string, password: string) => {
  await ensureDatabase();
  const id = `profile_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const token = createSecretToken();
  const tokenHash = await hashToken(token);
  const salt = randomBytes(18).toString("base64");
  const passwordHash = (await derivePassword(password, salt)).toString("base64");
  const now = Date.now();
  try {
    const profile = await inTransaction(async (client) => {
      const result = await client.query<ProfileRow>(
        `INSERT INTO profiles
          (id, nickname, nickname_key, password_salt, password_hash, created_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING ${profileColumns}`,
        [id, nickname, nickname.normalize("NFKC").toLocaleLowerCase("it"), salt, passwordHash, now],
      );
      await client.query(
        `INSERT INTO profile_sessions (token_hash, profile_id, created_at, last_seen_at)
         VALUES ($1, $2, $3, $3)`,
        [tokenHash, id, now],
      );
      return toPublicProfile(result.rows[0]);
    });
    return { token, profile };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Questo nickname è già registrato.");
    }
    throw error;
  }
};

export const loginProfile = async (nickname: string, password: string) => {
  await ensureDatabase();
  const result = await database().query<PrivateProfileRow>(
    `SELECT ${profileColumns}, password_salt, password_hash
       FROM profiles
      WHERE nickname_key = $1`,
    [nickname.normalize("NFKC").toLocaleLowerCase("it")],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Nickname o password non corretti.");
  const expected = Buffer.from(row.password_hash, "base64");
  const actual = await derivePassword(password, row.password_salt);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Nickname o password non corretti.");
  }
  const token = createSecretToken();
  const now = Date.now();
  await database().query(
    `INSERT INTO profile_sessions (token_hash, profile_id, created_at, last_seen_at)
     VALUES ($1, $2, $3, $3)`,
    [await hashToken(token), row.id, now],
  );
  await database().query(
    `UPDATE profiles SET last_seen_at = $1, presence_status = 'home', current_room_code = NULL WHERE id = $2`,
    [now, row.id],
  );
  return { token, profile: toPublicProfile(row) };
};

export const authenticateProfile = async (token: string, presence?: "home" | "playing" | "spectating", roomCode?: string) => {
  await ensureDatabase();
  if (!token) return null;
  const now = Date.now();
  const session = await database().query<{ profile_id: string }>(
    `UPDATE profile_sessions
        SET last_seen_at = $1
      WHERE token_hash = $2
      RETURNING profile_id`,
    [now, await hashToken(token)],
  );
  const profileId = session.rows[0]?.profile_id;
  if (!profileId) return null;
  const result = await database().query<ProfileRow>(
    `UPDATE profiles
        SET last_seen_at = $1,
            presence_status = COALESCE($2, presence_status),
            current_room_code = CASE WHEN $2 IS NULL THEN current_room_code ELSE $3 END
      WHERE id = $4
      RETURNING ${profileColumns}`,
    [now, presence ?? null, presence ? roomCode ?? null : null, profileId],
  );
  return result.rows[0] ? toPublicProfile(result.rows[0]) : null;
};

export const logoutProfile = async (token: string) => {
  await ensureDatabase();
  if (!token) return;
  await database().query("DELETE FROM profile_sessions WHERE token_hash = $1", [await hashToken(token)]);
};

export const readGame = async (code: string): Promise<StoredGame | null> => {
  await ensureDatabase();
  const result = await database().query<{ state: GameState | string; version: number }>(
    "SELECT state, version FROM games WHERE code = $1",
    [code],
  );
  const row = result.rows[0];
  if (!row) return null;
  const state = typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state;
  return { state, version: row.version };
};

export const authenticateRoomMember = async (code: string, token: string): Promise<AuthenticatedRoomMember | null> => {
  await ensureDatabase();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const result = await database().query<{ id: string; role: RoomMemberRole; profile_id?: string }>(
    `UPDATE room_players
        SET last_seen_at = $1
      WHERE game_code = $2 AND token_hash = $3
      RETURNING id, role, profile_id`,
    [now, code, tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.profile_id) {
    await database().query(
      `UPDATE profiles
          SET last_seen_at = $1,
              presence_status = $2,
              current_room_code = $3
        WHERE id = $4`,
      [now, row.role === "spectator" ? "spectating" : "playing", code, row.profile_id],
    );
  }
  return { id: row.id, role: row.role, profileId: row.profile_id };
};

export const authenticatePlayer = async (code: string, token: string) => {
  const member = await authenticateRoomMember(code, token);
  return member?.role === "player" ? member.id : null;
};

export const insertGame = async (
  state: GameState,
  player: { id: string; name: string; color: string; tokenHash: string; profileId?: string },
) => {
  await ensureDatabase();
  const now = Date.now();
  await inTransaction(async (client) => {
    await client.query(
      `INSERT INTO games
        (code, host_player_id, state, status, version, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, 1, $5, $6)`,
      [state.code, state.hostId, JSON.stringify(state), state.phase, now, now],
    );
    await client.query(
      `INSERT INTO room_players
        (id, game_code, name, color, token_hash, joined_at, role, profile_id, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'player', $7, $6)`,
      [player.id, state.code, player.name, player.color, player.tokenHash, now, player.profileId ?? null],
    );
  });
};

export const insertRoomPlayer = async (
  code: string,
  player: {
    id: string;
    name: string;
    color: string;
    tokenHash: string;
    profileId?: string;
    role?: RoomMemberRole;
  },
) => {
  await ensureDatabase();
  const now = Date.now();
  await database().query(
    `INSERT INTO room_players
      (id, game_code, name, color, token_hash, joined_at, role, profile_id, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6)
     ON CONFLICT (id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           name = EXCLUDED.name,
           color = EXCLUDED.color,
           role = EXCLUDED.role,
           profile_id = EXCLUDED.profile_id,
           last_seen_at = EXCLUDED.last_seen_at`,
    [
      player.id,
      code,
      player.name,
      player.color,
      player.tokenHash,
      now,
      player.role ?? "player",
      player.profileId ?? null,
    ],
  );
};

export const findRoomMemberByProfile = async (
  code: string,
  profileId: string,
  role: RoomMemberRole,
) => {
  await ensureDatabase();
  const result = await database().query<{ id: string }>(
    `SELECT id FROM room_players WHERE game_code = $1 AND profile_id = $2 AND role = $3 LIMIT 1`,
    [code, profileId, role],
  );
  return result.rows[0]?.id;
};

export const deleteRoomPlayer = async (playerId: string) => {
  await ensureDatabase();
  await database().query("DELETE FROM room_players WHERE id = $1", [playerId]);
};

export const saveGame = async (code: string, expectedVersion: number, state: GameState) => {
  await ensureDatabase();
  const result = await database().query<{ version: number }>(
    `UPDATE games
       SET state = $1::jsonb,
           status = $2,
           host_player_id = $3,
           version = version + 1,
           updated_at = $4
     WHERE code = $5 AND version = $6
     RETURNING version`,
    [JSON.stringify(state), state.phase, state.hostId, Date.now(), code, expectedVersion],
  );
  const row = result.rows[0];
  if (!row) throw new StoreConflictError();
  return row.version;
};

export const roomCodeExists = async (code: string) => {
  await ensureDatabase();
  const result = await database().query("SELECT 1 FROM games WHERE code = $1", [code]);
  return result.rowCount !== 0;
};

export const getActiveSpectatorCount = async (code: string) => {
  await ensureDatabase();
  const result = await database().query<{ count: number | string }>(
    `SELECT COUNT(*) AS count
       FROM room_players
      WHERE game_code = $1
        AND role = 'spectator'
        AND COALESCE(last_seen_at, joined_at) >= $2`,
    [code, Date.now() - 60_000],
  );
  return Number(result.rows[0]?.count ?? 0);
};

export const getCommunitySnapshot = async (): Promise<CommunitySnapshot> => {
  await ensureDatabase();
  const now = Date.now();
  const [games, onlineRows, leaderboardRows] = await Promise.all([
    database().query<{ state: GameState | string; spectators: number | string }>(
      `SELECT g.state,
              (SELECT COUNT(*)
                 FROM room_players rp
                WHERE rp.game_code = g.code
                  AND rp.role = 'spectator'
                  AND COALESCE(rp.last_seen_at, rp.joined_at) >= $1) AS spectators
         FROM games g
        WHERE COALESCE(g.state #>> '{settings,visibility}', 'private') = 'public'
          AND g.status IN ('lobby', 'setup', 'reinforce', 'attack', 'fortify')
          AND g.updated_at >= $2
        ORDER BY CASE WHEN g.status = 'lobby' THEN 0 ELSE 1 END, g.created_at DESC
        LIMIT 40`,
      [now - 60_000, now - 24 * 60 * 60_000],
    ),
    database().query<ProfileRow & { presence_status: string; last_seen_at: number | string }>(
      `SELECT ${profileColumns}, presence_status, last_seen_at
         FROM profiles
        WHERE last_seen_at >= $1
        ORDER BY last_seen_at DESC
        LIMIT 80`,
      [now - 45_000],
    ),
    database().query<ProfileRow>(
      `SELECT ${profileColumns}
         FROM profiles
        ORDER BY rating DESC, wins DESC,
                 CASE WHEN games_played > 0 THEN wins::float / games_played ELSE 0 END DESC,
                 territories_conquered DESC, created_at ASC
        LIMIT 50`,
    ),
  ]);

  const rooms: PublicRoomSummary[] = games.rows.map((row) => {
    const state = typeof row.state === "string" ? (JSON.parse(row.state) as GameState) : row.state;
    const humans = state.players.filter((player) => !player.isBot).length;
    const bots = state.players.filter((player) => player.isBot).length;
    return {
      code: state.code,
      hostName: state.players.find((player) => player.id === state.hostId)?.name ?? "Comandante",
      phase: state.phase,
      players: state.players.length,
      humans,
      bots,
      maxPlayers: state.settings.maxPlayers,
      timeLimitMinutes: state.settings.timeLimitMinutes,
      spectators: Number(row.spectators),
      createdAt: state.createdAt,
      startedAt: state.startedAt,
    };
  });
  const online: OnlineProfile[] = onlineRows.rows.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    rating: Number(row.rating),
    presence: (["playing", "spectating"].includes(row.presence_status)
      ? row.presence_status
      : "home") as OnlineProfile["presence"],
    lastSeenAt: Number(row.last_seen_at),
  }));
  return {
    generatedAt: now,
    rooms,
    online,
    leaderboard: leaderboardRows.rows.map(toPublicProfile),
  };
};

export const recordCompletedGame = async (state: GameState) => {
  if (state.phase !== "gameover" || !state.winnerId) return;
  await ensureDatabase();
  const players = state.players.filter((player) => !player.isBot && player.profileId);
  if (!players.length) return;
  const matchId = state.matchId ?? `legacy_${state.startedAt ?? state.createdAt}`;
  const winnerIsHuman = players.some((player) => player.id === state.winnerId);
  const winDelta = 32 + Math.max(0, players.length - 2) * 4;
  const lossDelta = -Math.max(8, Math.floor(winDelta / Math.max(1, players.length - 1)));
  const now = Date.now();

  await inTransaction(async (client) => {
    for (const player of players) {
      const won = player.id === state.winnerId;
      const objectiveScore = (player.objective?.territoryIds ?? [])
        .filter((territoryId) => state.territories[territoryId].ownerId === player.id)
        .reduce((sum, territoryId) => sum + TERRITORY_BY_ID[territoryId].value, 0);
      const ratingDelta = won ? winDelta : winnerIsHuman ? lossDelta : -8;
      const inserted = await client.query(
        `INSERT INTO game_results
          (game_code, match_id, profile_id, won, objective_score, rating_delta, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING profile_id`,
        [state.code, matchId, player.profileId, won, objectiveScore, ratingDelta, now],
      );
      if (!inserted.rowCount) continue;
      await client.query(
        `UPDATE profiles
            SET games_played = games_played + 1,
                wins = wins + $1,
                losses = losses + $2,
                rating = GREATEST(100, rating + $3),
                total_attacks = total_attacks + $4,
                territories_conquered = territories_conquered + $5,
                armies_defeated = armies_defeated + $6,
                sets_traded = sets_traded + $7,
                best_objective_score = GREATEST(best_objective_score, $8)
          WHERE id = $9`,
        [
          won ? 1 : 0,
          won ? 0 : 1,
          ratingDelta,
          player.stats.attacks,
          player.stats.territoriesConquered,
          player.stats.armiesDefeated,
          player.stats.setsTraded,
          objectiveScore,
          player.profileId,
        ],
      );
    }
  });
};

export const checkDatabase = async () => {
  await ensureDatabase();
  await database().query("SELECT 1");
};

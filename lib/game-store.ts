import { Pool, type PoolClient } from "pg";
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

        CREATE TABLE IF NOT EXISTS room_players (
          id TEXT PRIMARY KEY,
          game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          joined_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS room_players_game_code_idx
          ON room_players (game_code);
        CREATE INDEX IF NOT EXISTS room_players_token_idx
          ON room_players (game_code, token_hash);
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

export const authenticatePlayer = async (code: string, token: string) => {
  await ensureDatabase();
  const tokenHash = await hashToken(token);
  const result = await database().query<{ id: string }>(
    "SELECT id FROM room_players WHERE game_code = $1 AND token_hash = $2",
    [code, tokenHash],
  );
  return result.rows[0]?.id ?? null;
};

export const insertGame = async (
  state: GameState,
  player: { id: string; name: string; color: string; tokenHash: string },
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
        (id, game_code, name, color, token_hash, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [player.id, state.code, player.name, player.color, player.tokenHash, now],
    );
  });
};

export const insertRoomPlayer = async (
  code: string,
  player: { id: string; name: string; color: string; tokenHash: string },
) => {
  await ensureDatabase();
  await database().query(
    `INSERT INTO room_players
      (id, game_code, name, color, token_hash, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [player.id, code, player.name, player.color, player.tokenHash, Date.now()],
  );
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

export const checkDatabase = async () => {
  await ensureDatabase();
  await database().query("SELECT 1");
};

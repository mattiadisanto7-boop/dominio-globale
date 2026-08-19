import { PLAYER_COLORS } from "@/lib/game-data";
import { addLobbyPlayer, applyGameAction, GameRuleError, sanitizeState } from "@/lib/game-engine";
import {
  authenticatePlayer,
  createSecretToken,
  deleteRoomPlayer,
  hashToken,
  insertRoomPlayer,
  readGame,
  saveGame,
  StoreConflictError,
} from "@/lib/game-store";
import type { GameAction } from "@/lib/game-types";

const cleanCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const cleanName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 24) : "";

const bearer = (request: Request) => {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const errorResponse = (error: unknown) => {
  if (error instanceof GameRuleError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof StoreConflictError) {
    return Response.json({ error: error.message, conflict: true }, { status: 409 });
  }
  const message = error instanceof Error ? error.message : "Operazione non riuscita.";
  return Response.json({ error: message }, { status: 500 });
};

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const code = cleanCode((await context.params).code);
    const token = bearer(request);
    if (!token) return Response.json({ error: "Accesso alla sala richiesto." }, { status: 401 });
    const playerId = await authenticatePlayer(code, token);
    if (!playerId) return Response.json({ error: "Accesso non valido o scaduto." }, { status: 401 });
    const stored = await readGame(code);
    if (!stored) return Response.json({ error: "Sala non trovata." }, { status: 404 });
    if (!stored.state.players.some((player) => player.id === playerId)) {
      return Response.json({ error: "Non fai più parte di questa sala." }, { status: 403 });
    }
    return Response.json({ version: stored.version, meId: playerId, state: sanitizeState(stored.state, playerId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await context.params).code);
  try {
    const payload = (await request.json()) as {
      intent?: "join" | "action";
      name?: string;
      version?: number;
      action?: GameAction;
    };

    if (payload.intent === "join") {
      const name = cleanName(payload.name);
      if (name.length < 2) {
        return Response.json({ error: "Inserisci un nome di almeno 2 caratteri." }, { status: 400 });
      }
      const stored = await readGame(code);
      if (!stored) return Response.json({ error: "Sala non trovata. Controlla il codice." }, { status: 404 });
      const playerId = `player_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const token = createSecretToken();
      const next = structuredClone(stored.state);
      addLobbyPlayer(next, { id: playerId, name });
      const color = PLAYER_COLORS[next.players.length - 1].hex;
      await insertRoomPlayer(code, { id: playerId, name, color, tokenHash: await hashToken(token) });
      try {
        const version = await saveGame(code, stored.version, next);
        return Response.json({ code, token, playerId, version }, { status: 201 });
      } catch (error) {
        await deleteRoomPlayer(playerId);
        throw error;
      }
    }

    const token = bearer(request);
    if (!token) return Response.json({ error: "Accesso alla sala richiesto." }, { status: 401 });
    const playerId = await authenticatePlayer(code, token);
    if (!playerId) return Response.json({ error: "Accesso non valido o scaduto." }, { status: 401 });
    const stored = await readGame(code);
    if (!stored) return Response.json({ error: "Sala non trovata." }, { status: 404 });
    if (!stored.state.players.some((player) => player.id === playerId)) {
      return Response.json({ error: "Non fai più parte di questa sala." }, { status: 403 });
    }
    if (!payload.action) return Response.json({ error: "Azione mancante." }, { status: 400 });
    if (payload.version !== stored.version) throw new StoreConflictError();
    const next = applyGameAction(stored.state, playerId, payload.action);
    const version = await saveGame(code, stored.version, next);
    return Response.json({ version, meId: playerId, state: sanitizeState(next, playerId) });
  } catch (error) {
    return errorResponse(error);
  }
}


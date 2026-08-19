import { addLobbyPlayer, applyGameAction, GameRuleError, sanitizeState } from "@/lib/game-engine";
import {
  authenticateProfile,
  authenticateRoomMember,
  createSecretToken,
  deleteRoomPlayer,
  findRoomMemberByProfile,
  getActiveSpectatorCount,
  hashToken,
  insertRoomPlayer,
  readGame,
  recordCompletedGame,
  saveGame,
  StoreConflictError,
} from "@/lib/game-store";
import type { GameAction } from "@/lib/game-types";

const cleanCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
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
    const member = await authenticateRoomMember(code, token);
    if (!member) return Response.json({ error: "Accesso non valido o scaduto." }, { status: 401 });
    const stored = await readGame(code);
    if (!stored) return Response.json({ error: "Sala non trovata." }, { status: 404 });
    if (member.role === "player" && !stored.state.players.some((player) => player.id === member.id)) {
      return Response.json({ error: "Non fai più parte di questa sala." }, { status: 403 });
    }
    if (stored.state.phase === "gameover") await recordCompletedGame(stored.state);
    return Response.json({
      version: stored.version,
      meId: member.id,
      role: member.role,
      spectatorCount: await getActiveSpectatorCount(code),
      state: sanitizeState(stored.state, member.role === "player" ? member.id : "__spectator__"),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await context.params).code);
  try {
    const payload = (await request.json()) as {
      intent?: "join" | "spectate" | "action";
      name?: string;
      version?: number;
      action?: GameAction;
    };

    if (payload.intent === "join" || payload.intent === "spectate") {
      const profile = await authenticateProfile(bearer(request), "home");
      if (!profile) return Response.json({ error: "Accedi al tuo profilo per entrare." }, { status: 401 });
      const stored = await readGame(code);
      if (!stored) return Response.json({ error: "Sala non trovata. Controlla il codice." }, { status: 404 });

      if (payload.intent === "spectate") {
        if (stored.state.phase === "lobby") {
          return Response.json({ error: "La modalità spettatore si attiva quando la partita è iniziata." }, { status: 400 });
        }
        const existingId = await findRoomMemberByProfile(code, profile.id, "spectator");
        const spectatorId = existingId ?? `spectator_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
        const token = createSecretToken();
        await insertRoomPlayer(code, {
          id: spectatorId,
          name: profile.nickname,
          color: "#84938e",
          tokenHash: await hashToken(token),
          profileId: profile.id,
          role: "spectator",
        });
        return Response.json({ code, token, memberId: spectatorId, role: "spectator", version: stored.version }, { status: 201 });
      }

      const existingPlayer = stored.state.players.find((player) => player.profileId === profile.id);
      if (existingPlayer) {
        const token = createSecretToken();
        await insertRoomPlayer(code, {
          id: existingPlayer.id,
          name: profile.nickname,
          color: existingPlayer.color,
          tokenHash: await hashToken(token),
          profileId: profile.id,
          role: "player",
        });
        return Response.json({ code, token, playerId: existingPlayer.id, role: "player", version: stored.version }, { status: 200 });
      }

      const playerId = `player_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const token = createSecretToken();
      const next = structuredClone(stored.state);
      addLobbyPlayer(next, { id: playerId, name: profile.nickname, profileId: profile.id });
      const color = next.players.find((player) => player.id === playerId)!.color;
      await insertRoomPlayer(code, {
        id: playerId,
        name: profile.nickname,
        color,
        tokenHash: await hashToken(token),
        profileId: profile.id,
        role: "player",
      });
      try {
        const version = await saveGame(code, stored.version, next);
        return Response.json({ code, token, playerId, role: "player", version }, { status: 201 });
      } catch (error) {
        await deleteRoomPlayer(playerId);
        throw error;
      }
    }

    const token = bearer(request);
    if (!token) return Response.json({ error: "Accesso alla sala richiesto." }, { status: 401 });
    const member = await authenticateRoomMember(code, token);
    if (!member) return Response.json({ error: "Accesso non valido o scaduto." }, { status: 401 });
    if (member.role !== "player") return Response.json({ error: "Gli spettatori non possono modificare la partita." }, { status: 403 });
    const playerId = member.id;
    const stored = await readGame(code);
    if (!stored) return Response.json({ error: "Sala non trovata." }, { status: 404 });
    if (!stored.state.players.some((player) => player.id === playerId)) {
      return Response.json({ error: "Non fai più parte di questa sala." }, { status: 403 });
    }
    if (!payload.action) return Response.json({ error: "Azione mancante." }, { status: 400 });
    if (payload.version !== stored.version) throw new StoreConflictError();
    const next = applyGameAction(stored.state, playerId, payload.action);
    const version = await saveGame(code, stored.version, next);
    if (next.phase === "gameover") await recordCompletedGame(next);
    return Response.json({
      version,
      meId: playerId,
      role: "player",
      spectatorCount: await getActiveSpectatorCount(code),
      state: sanitizeState(next, playerId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

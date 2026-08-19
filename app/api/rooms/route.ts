import { PLAYER_COLORS } from "@/lib/game-data";
import { createLobby } from "@/lib/game-engine";
import {
  authenticateProfile,
  createSecretToken,
  hashToken,
  insertGame,
  roomCodeExists,
} from "@/lib/game-store";
import type { GameSettings } from "@/lib/game-types";

const bearer = (request: Request) => {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const generateCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = new Uint32Array(6);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join("");
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      name?: string;
      maxPlayers?: number;
      timeLimitMinutes?: number;
      visibility?: "public" | "private";
    };
    const profile = await authenticateProfile(bearer(request), "home");
    if (!profile) return Response.json({ error: "Accedi al tuo profilo per creare una stanza." }, { status: 401 });

    const maxPlayers = [2, 3, 4, 5, 6].includes(Number(payload.maxPlayers))
      ? (Number(payload.maxPlayers) as GameSettings["maxPlayers"])
      : 4;
    const timeLimitMinutes = [0, 45, 60, 90].includes(Number(payload.timeLimitMinutes))
      ? (Number(payload.timeLimitMinutes) as GameSettings["timeLimitMinutes"])
      : 90;
    const settings: GameSettings = {
      maxPlayers,
      mode: "missioni",
      timeLimitMinutes,
      defense: "automatic",
      visibility: payload.visibility === "private" ? "private" : "public",
    };

    let code = generateCode();
    for (let attempt = 0; attempt < 5 && (await roomCodeExists(code)); attempt += 1) {
      code = generateCode();
    }
    const playerId = `player_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const token = createSecretToken();
    const state = createLobby(code, { id: playerId, name: profile.nickname, profileId: profile.id }, settings);
    await insertGame(state, {
      id: playerId,
      name: profile.nickname,
      color: PLAYER_COLORS[0].hex,
      tokenHash: await hashToken(token),
      profileId: profile.id,
    });
    return Response.json({ code, token, playerId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossibile creare la sala.";
    return Response.json({ error: message }, { status: 500 });
  }
}

import { PLAYER_COLORS } from "@/lib/game-data";
import { createLobby } from "@/lib/game-engine";
import {
  createSecretToken,
  hashToken,
  insertGame,
  roomCodeExists,
} from "@/lib/game-store";
import type { GameSettings } from "@/lib/game-types";

const cleanName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 24) : "";

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
      mode?: string;
      timeLimitMinutes?: number;
    };
    const name = cleanName(payload.name);
    if (name.length < 2) {
      return Response.json({ error: "Inserisci un nome di almeno 2 caratteri." }, { status: 400 });
    }

    const maxPlayers = [2, 3, 4, 5, 6].includes(Number(payload.maxPlayers))
      ? (Number(payload.maxPlayers) as GameSettings["maxPlayers"])
      : 4;
    const timeLimitMinutes = [0, 45, 60, 90].includes(Number(payload.timeLimitMinutes))
      ? (Number(payload.timeLimitMinutes) as GameSettings["timeLimitMinutes"])
      : 0;
    const settings: GameSettings = {
      maxPlayers,
      mode: payload.mode === "dominio" ? "dominio" : "missioni",
      timeLimitMinutes,
      defense: "interactive",
    };

    let code = generateCode();
    for (let attempt = 0; attempt < 5 && (await roomCodeExists(code)); attempt += 1) {
      code = generateCode();
    }
    const playerId = `player_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const token = createSecretToken();
    const state = createLobby(code, { id: playerId, name }, settings);
    await insertGame(state, {
      id: playerId,
      name,
      color: PLAYER_COLORS[0].hex,
      tokenHash: await hashToken(token),
    });
    return Response.json({ code, token, playerId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossibile creare la sala.";
    return Response.json({ error: message }, { status: 500 });
  }
}


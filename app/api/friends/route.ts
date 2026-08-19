import {
  authenticateProfile,
  FriendshipRuleError,
  getFriendsSnapshot,
  updateFriendship,
} from "@/lib/game-store";
import type { FriendActionIntent } from "@/lib/community-types";

const bearer = (request: Request) => {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const noStore = { "cache-control": "no-store" };
const intents: FriendActionIntent[] = ["request", "accept", "reject", "cancel", "remove"];

const errorResponse = (error: unknown) => {
  const status = error instanceof FriendshipRuleError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Operazione di amicizia non riuscita.";
  return Response.json({ error: message }, { status, headers: noStore });
};

export async function GET(request: Request) {
  try {
    const profile = await authenticateProfile(bearer(request), "home");
    if (!profile) return Response.json({ error: "Accedi per vedere i tuoi amici." }, { status: 401, headers: noStore });
    return Response.json(await getFriendsSnapshot(profile.id), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await authenticateProfile(bearer(request), "home");
    if (!profile) return Response.json({ error: "Accedi per gestire le amicizie." }, { status: 401, headers: noStore });
    const payload = (await request.json()) as { intent?: FriendActionIntent; profileId?: string };
    if (!payload.intent || !intents.includes(payload.intent) || typeof payload.profileId !== "string") {
      return Response.json({ error: "Operazione di amicizia non valida." }, { status: 400, headers: noStore });
    }
    await updateFriendship(profile.id, payload.profileId, payload.intent);
    return Response.json(await getFriendsSnapshot(profile.id), { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}

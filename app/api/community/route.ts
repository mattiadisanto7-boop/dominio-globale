import { authenticateProfile, getCommunitySnapshot } from "@/lib/game-store";

const bearer = (request: Request) => {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

export async function GET(request: Request) {
  try {
    const token = bearer(request);
    if (token) await authenticateProfile(token, "home");
    const snapshot = await getCommunitySnapshot();
    return Response.json(snapshot, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Community non disponibile." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

import { checkDatabase } from "@/lib/game-store";

export async function GET() {
  try {
    await checkDatabase();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "database-unavailable" }, { status: 503 });
  }
}

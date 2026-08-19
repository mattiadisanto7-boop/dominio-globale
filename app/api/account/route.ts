import {
  authenticateProfile,
  createProfile,
  loginProfile,
  logoutProfile,
} from "@/lib/game-store";

const bearer = (request: Request) => {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const cleanNickname = (value: unknown) =>
  typeof value === "string" ? value.trim().normalize("NFKC").slice(0, 20) : "";

const validNickname = (nickname: string) =>
  /^[A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{3,20}$/.test(nickname);

const cleanPassword = (value: unknown) => typeof value === "string" ? value.slice(0, 128) : "";

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try {
    const token = bearer(request);
    if (!token) return Response.json({ error: "Sessione mancante." }, { status: 401, headers: noStore });
    const profile = await authenticateProfile(token, "home");
    if (!profile) return Response.json({ error: "Sessione scaduta. Accedi di nuovo." }, { status: 401, headers: noStore });
    return Response.json({ profile }, { headers: noStore });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Impossibile caricare il profilo." },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      intent?: "register" | "login" | "logout";
      nickname?: string;
      password?: string;
    };
    if (payload.intent === "logout") {
      await logoutProfile(bearer(request));
      return Response.json({ success: true }, { headers: noStore });
    }
    const nickname = cleanNickname(payload.nickname);
    const password = cleanPassword(payload.password);
    if (!validNickname(nickname)) {
      return Response.json(
        { error: "Il nickname deve avere 3–20 caratteri: lettere, numeri, trattino o underscore." },
        { status: 400, headers: noStore },
      );
    }
    if (password.length < 8) {
      return Response.json({ error: "La password deve avere almeno 8 caratteri." }, { status: 400, headers: noStore });
    }
    if (payload.intent !== "register" && payload.intent !== "login") {
      return Response.json({ error: "Operazione account non valida." }, { status: 400, headers: noStore });
    }
    const result = payload.intent === "register"
      ? await createProfile(nickname, password)
      : await loginProfile(nickname, password);
    return Response.json(result, { status: payload.intent === "register" ? 201 : 200, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operazione account non riuscita.";
    const status = message.includes("già registrato") ? 409 : message.includes("non corretti") ? 401 : 500;
    return Response.json({ error: message }, { status, headers: noStore });
  }
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Brand from "@/components/Brand";
import GameRoom from "@/components/GameRoom";
import HomeScreen from "@/components/HomeScreen";
import type { AccountEnvelope, PublicProfile } from "@/lib/community-types";
import type { RoomEnvelope } from "@/lib/game-types";

const TOKEN_PREFIX = "dominio-globale:token:";
const ACCOUNT_TOKEN_KEY = "dominio-globale:account-token";
const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
const readError = (payload: unknown, fallback: string) => payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;

function LoadingRoom() {
  return <main className="loading-screen"><Brand /><div className="loading-orbit"><i /><i /><i /></div><p>Sincronizzazione della sala di comando…</p></main>;
}

export default function DominioApp() {
  const [roomCode, setRoomCode] = useState(""), [token, setToken] = useState("");
  const [envelope, setEnvelope] = useState<RoomEnvelope>(), [initializing, setInitializing] = useState(true), [fatalError, setFatalError] = useState("");
  const [accountToken, setAccountToken] = useState(""), [profile, setProfile] = useState<PublicProfile>();

  const enterRoom = useCallback((code: string, nextToken: string) => {
    const normalized = cleanCode(code);
    localStorage.setItem(`${TOKEN_PREFIX}${normalized}`, nextToken);
    const url = new URL(window.location.href); url.searchParams.set("stanza", normalized); window.history.replaceState({}, "", url);
    setRoomCode(normalized); setToken(nextToken); setEnvelope(undefined); setFatalError("");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const code = cleanCode(new URLSearchParams(window.location.search).get("stanza") ?? "");
      const savedAccountToken = localStorage.getItem(ACCOUNT_TOKEN_KEY) ?? "";
      setRoomCode(code);
      setToken(code ? localStorage.getItem(`${TOKEN_PREFIX}${code}`) ?? "" : "");
      setAccountToken(savedAccountToken);
      if (savedAccountToken) {
        try {
          const response = await fetch("/api/account", {
            headers: { authorization: `Bearer ${savedAccountToken}` },
            cache: "no-store",
          });
          const payload = (await response.json()) as { profile?: PublicProfile };
          if (response.ok && payload.profile) setProfile(payload.profile);
          else {
            localStorage.removeItem(ACCOUNT_TOKEN_KEY);
            setAccountToken("");
          }
        } catch {
          // Una temporanea assenza di rete non invalida la sessione locale.
        }
      }
      setInitializing(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!roomCode || !token) return;
    let cancelled = false;
    fetch(`/api/rooms/${roomCode}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" })
      .then(async (response) => { const payload = (await response.json()) as RoomEnvelope & { error?: string }; if (!response.ok) throw new Error(readError(payload, "Impossibile aprire la sala.")); if (!cancelled) setEnvelope(payload); })
      .catch((error) => { if (!cancelled) setFatalError(error instanceof Error ? error.message : "Impossibile aprire la sala."); });
    return () => { cancelled = true; };
  }, [roomCode, token]);

  const leave = (forgetToken = false) => {
    if (forgetToken && roomCode) localStorage.removeItem(`${TOKEN_PREFIX}${roomCode}`);
    const url = new URL(window.location.href); url.searchParams.delete("stanza"); window.history.replaceState({}, "", url);
    setRoomCode(""); setToken(""); setEnvelope(undefined); setFatalError("");
  };

  const authenticate = (account: AccountEnvelope) => {
    localStorage.setItem(ACCOUNT_TOKEN_KEY, account.token);
    setAccountToken(account.token);
    setProfile(account.profile);
  };

  const logout = () => {
    if (accountToken) {
      void fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accountToken}` },
        body: JSON.stringify({ intent: "logout" }),
      });
    }
    localStorage.removeItem(ACCOUNT_TOKEN_KEY);
    setAccountToken("");
    setProfile(undefined);
  };

  if (initializing || (roomCode && token && !envelope && !fatalError)) return <LoadingRoom />;
  if (fatalError) return <main className="loading-screen error-screen"><Brand /><h1>Non riesco ad aprire la sala</h1><p>{fatalError}</p><button className="primary-button" onClick={() => { localStorage.removeItem(`${TOKEN_PREFIX}${roomCode}`); setToken(""); setFatalError(""); }}>Entra di nuovo con il codice</button><button className="text-button" onClick={() => leave()}>Torna al menu</button></main>;
  if (roomCode && !token) return <HomeScreen initialCode={roomCode} onEnter={enterRoom} accountToken={accountToken} profile={profile} onAuthenticate={authenticate} onLogout={logout} />;
  if (envelope && token) return <GameRoom envelope={envelope} onEnvelope={setEnvelope} token={token} onLeave={leave} />;
  return <HomeScreen initialCode="" onEnter={enterRoom} accountToken={accountToken} profile={profile} onAuthenticate={authenticate} onLogout={logout} />;
}

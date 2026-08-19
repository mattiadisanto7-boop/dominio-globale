"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import BoardPreview from "@/components/BoardPreview";
import Brand from "@/components/Brand";
import CommunityHub from "@/components/CommunityHub";
import SoundControl from "@/components/SoundControl";
import type { AccountEnvelope, CommunitySnapshot, PublicProfile } from "@/lib/community-types";

const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

function readError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

function RulesModal({ onClose }: { onClose: () => void }) {
  const steps = [
    ["01", "Schiera", "Ricevi territori casuali. A turno piazzi 3 armate, una per clic e anche su territori differenti; poi il comando passa. Il timer parte soltanto quando tutti hanno finito."],
    ["02", "Rinforza", "A ogni turno ottieni almeno 3 armate, più i bonus dei continenti. Appena piazzi l'ultima, il gioco passa automaticamente all'attacco."],
    ["03", "Attacca", "Scegli due territori confinanti e premi una volta. Il server lancia i dadi massimi; da 2 armate non puoi attaccarne 2+, da 3 non puoi attaccarne 3+. I pareggi favoriscono la difesa."],
    ["04", "Consolida", "Dopo gli attacchi puoi effettuare uno spostamento strategico. Se la partenza confina con un nemico, devono restarvi almeno 2 armate; l'occupazione minima dopo una conquista applica da sola l'eventuale eccezione."],
    ["05", "Completa la carta", "I territori richiesti usano il tuo colore: pieno se sono già tuoi, chiarissimo se mancano. Il pulsante Carte apre in privato l'intero mazzo che possiedi."],
    ["06", "Chiudi la campagna", "Puoi riempire i posti liberi con generali bot. La modalità principale dura 90 minuti dopo lo schieramento, poi ultimo giro e sdadata da 4 a 7."],
  ];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Regole del gioco">
      <div className="rules-modal">
        <button className="modal-close" onClick={onClose} aria-label="Chiudi">×</button>
        <span className="eyebrow"><i /> Manuale rapido</span>
        <h2>Una guerra in sei mosse</h2>
        <p className="rules-lead">Le regole vengono controllate automaticamente: la plancia mostra sempre quali azioni sono possibili.</p>
        <div className="rules-steps">
          {steps.map(([number, title, text]) => (
            <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>
          ))}
        </div>
        <div className="rules-callout">
          <b>Tris Challenge:</b> tre simboli uguali = 8 armate, tre simboli diversi = 10, Jolly più due simboli uguali = 12.
          Con 5 carte il cambio è obbligatorio.
        </div>
        <button className="primary-button" onClick={onClose}>Ho capito, prepariamo la mappa</button>
      </div>
    </div>
  );
}

export default function HomeScreen({
  initialCode,
  onEnter,
  accountToken,
  profile,
  onAuthenticate,
  onLogout,
}: {
  initialCode: string;
  onEnter: (code: string, token: string) => void;
  accountToken: string;
  profile?: PublicProfile;
  onAuthenticate: (account: AccountEnvelope) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(initialCode);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [timeLimit, setTimeLimit] = useState(90);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [busyCode, setBusyCode] = useState("");
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [community, setCommunity] = useState<CommunitySnapshot>();
  const [communityLoading, setCommunityLoading] = useState(true);
  const displayedProfile = community?.leaderboard.find((item) => item.id === profile?.id) ?? profile;

  const loadCommunity = useCallback(async () => {
    try {
      const response = await fetch("/api/community", {
        headers: accountToken ? { authorization: `Bearer ${accountToken}` } : undefined,
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setCommunity((await response.json()) as CommunitySnapshot);
    } catch {
      // La home resta utilizzabile anche durante una temporanea assenza del server community.
    } finally {
      setCommunityLoading(false);
    }
  }, [accountToken]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadCommunity(), 0);
    const timer = window.setInterval(() => void loadCommunity(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [loadCommunity]);

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: authMode, nickname, password }),
      });
      const payload = (await response.json()) as AccountEnvelope & { error?: string };
      if (!response.ok || !payload.token || !payload.profile) throw new Error(readError(payload, "Accesso non riuscito."));
      onAuthenticate(payload);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Accesso non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const submitRoom = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!accountToken || !profile) return setError("Accedi prima al tuo profilo.");
    setBusy(true);
    try {
      const endpoint = tab === "create" ? "/api/rooms" : `/api/rooms/${cleanCode(code)}`;
      const body = tab === "create"
        ? { maxPlayers, timeLimitMinutes: timeLimit, visibility }
        : { intent: "join" };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accountToken}` }, body: JSON.stringify(body) });
      const payload = (await response.json()) as { code?: string; token?: string; error?: string };
      if (!response.ok || !payload.code || !payload.token) throw new Error(readError(payload, "Non è stato possibile entrare nella sala."));
      onEnter(payload.code, payload.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  const enterListedRoom = async (roomCode: string, intent: "join" | "spectate") => {
    if (!accountToken || !profile || busyCode) return;
    setError("");
    setBusyCode(roomCode);
    try {
      const response = await fetch(`/api/rooms/${cleanCode(roomCode)}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accountToken}` },
        body: JSON.stringify({ intent }),
      });
      const payload = (await response.json()) as { code?: string; token?: string; error?: string };
      if (!response.ok || !payload.code || !payload.token) throw new Error(readError(payload, "Non è stato possibile aprire la sala."));
      onEnter(payload.code, payload.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
    } finally {
      setBusyCode("");
    }
  };

  return (
    <main className="landing-shell">
      <div className="landing-aurora landing-aurora-one" /><div className="landing-aurora landing-aurora-two" />
      <header className="landing-nav"><Brand /><div className="landing-nav-actions">{displayedProfile && <div className="profile-chip"><span>{displayedProfile.nickname.slice(0, 1).toUpperCase()}</span><div><b>{displayedProfile.nickname}</b><small>{displayedProfile.rating} rating</small></div></div>}<SoundControl /><button className="ghost-button" onClick={() => setRulesOpen(true)}>Regole del gioco</button>{profile && <button className="logout-button" onClick={onLogout}>Esci</button>}</div></header>
      <section className="landing-content">
        <div className="hero-copy">
          <span className="eyebrow"><i /> Strategia online · 2–6 giocatori</span>
          <h1>Il mondo non si conquista per caso.</h1>
          <p>Il tabellone mondiale completo, le 16 carte Challenge da 86 punti, bot strategici, obiettivi personali e dadi automatici animati. La modalità principale dura 90 minuti dopo lo schieramento, ultimo giro e sdadata finale.</p>
          <div className="feature-row"><span><b>42</b> territori</span><span><b>16</b> obiettivi</span><span><b>86</b> punti</span></div>
        </div>
        <div className="war-room-card">
          {!profile ? <>
            <div className="account-heading"><span className="account-seal">✦</span><div><small>PROFILO COMANDANTE</small><h2>{authMode === "register" ? "Crea il tuo quartier generale" : "Bentornato sul fronte"}</h2></div></div>
            <div className="card-tabs account-tabs" role="tablist" aria-label="Registrazione o accesso">
              <button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setError(""); }}>Registrati</button>
              <button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setError(""); }}>Accedi</button>
            </div>
            <form onSubmit={submitAccount}>
              <label className="field-label">Nickname unico<input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} placeholder="Es. GeneraleMattia" autoComplete="username" /></label>
              <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value.slice(0, 128))} placeholder="Almeno 8 caratteri" autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button full-button" disabled={busy}>{busy ? "Contatto del server…" : authMode === "register" ? "Crea profilo e accedi" : "Accedi al quartier generale"}</button>
            </form>
            <div className="secure-note"><span>✓</span> Password protetta · nickname e statistiche persistenti</div>
          </> : <>
            <div className="welcome-account"><span>{displayedProfile?.nickname.slice(0, 1).toUpperCase()}</span><div><small>COMANDANTE CONNESSO</small><b>{displayedProfile?.nickname}</b><em>{displayedProfile?.rating} rating · {displayedProfile?.wins} vittorie</em></div></div>
            <div className="card-tabs" role="tablist" aria-label="Scegli come giocare">
              <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>Crea sala</button>
              <button className={tab === "join" ? "active" : ""} onClick={() => setTab("join")}>Entra con codice</button>
            </div>
            <form onSubmit={submitRoom}>
              {tab === "join" ? (
                <label className="field-label">Codice sala<input className="room-code-input" value={code} onChange={(event) => setCode(cleanCode(event.target.value))} placeholder="ABC123" maxLength={6} autoCapitalize="characters" /></label>
              ) : (
                <div className="create-options">
                  <label className="field-label">Giocatori<select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{[2, 3, 4, 5, 6].map((number) => <option key={number} value={number}>{number} giocatori</option>)}</select></label>
                  <label className="field-label">Accesso<select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")}><option value="public">Pubblica · nella lobby</option><option value="private">Privata · solo codice</option></select></label>
                  <label className="field-label field-wide">Durata<select value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))}><option value={90}>Challenge principale · 90 min + sdadata</option><option value={60}>Time attack · 60 min + sdadata</option><option value={45}>Time attack · 45 min + sdadata</option><option value={0}>Senza limite</option></select></label>
                </div>
              )}
              {tab === "create" && maxPlayers === 2 && <p className="info-note">Nel duello, 14 territori neutrali rendono la mappa più tattica e bilanciata.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button full-button" disabled={busy || (tab === "join" && code.length !== 6)}>{busy ? "Preparazione della mappa…" : tab === "create" ? `Crea sala ${visibility === "public" ? "pubblica" : "privata"}` : "Entra nella sala"}</button>
            </form>
            <div className="secure-note"><span>✓</span> Le carte e l&apos;obiettivo restano visibili soltanto a te</div>
          </>}
        </div>
      </section>
      <CommunityHub snapshot={community} loading={communityLoading} profileId={profile?.id} busyCode={busyCode} onJoin={(roomCode) => void enterListedRoom(roomCode, "join")} onSpectate={(roomCode) => void enterListedRoom(roomCode, "spectate")} />
      <BoardPreview />
      <footer className="landing-footer"><span>Dominio Globale è un gioco originale di conquista strategica ispirato ai classici del genere.</span><button onClick={() => setRulesOpen(true)}>Come si gioca</button></footer>
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  );
}

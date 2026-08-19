"use client";

import { FormEvent, useState } from "react";
import BoardPreview from "@/components/BoardPreview";
import Brand from "@/components/Brand";
import SoundControl from "@/components/SoundControl";

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

export default function HomeScreen({ initialCode, onEnter }: { initialCode: string; onEnter: (code: string, token: string) => void }) {
  const [tab, setTab] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [timeLimit, setTimeLimit] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Inserisci il tuo nome.");
    setBusy(true);
    try {
      const endpoint = tab === "create" ? "/api/rooms" : `/api/rooms/${cleanCode(code)}`;
      const body = tab === "create"
        ? { name, maxPlayers, timeLimitMinutes: timeLimit }
        : { intent: "join", name };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json()) as { code?: string; token?: string; error?: string };
      if (!response.ok || !payload.code || !payload.token) throw new Error(readError(payload, "Non è stato possibile entrare nella sala."));
      onEnter(payload.code, payload.token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="landing-shell">
      <div className="landing-aurora landing-aurora-one" /><div className="landing-aurora landing-aurora-two" />
      <header className="landing-nav"><Brand /><div className="landing-nav-actions"><SoundControl /><button className="ghost-button" onClick={() => setRulesOpen(true)}>Regole del gioco</button></div></header>
      <section className="landing-content">
        <div className="hero-copy">
          <span className="eyebrow"><i /> Strategia online · 2–6 giocatori</span>
          <h1>Il mondo non si conquista per caso.</h1>
          <p>Il tabellone mondiale completo, le 16 carte Challenge da 86 punti, bot strategici, obiettivi personali e dadi automatici animati. La modalità principale dura 90 minuti dopo lo schieramento, ultimo giro e sdadata finale.</p>
          <div className="feature-row"><span><b>42</b> territori</span><span><b>16</b> obiettivi</span><span><b>86</b> punti</span></div>
        </div>
        <div className="war-room-card">
          <div className="card-tabs" role="tablist" aria-label="Scegli come giocare">
            <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>Crea sala</button>
            <button className={tab === "join" ? "active" : ""} onClick={() => setTab("join")}>Entra con codice</button>
          </div>
          <form onSubmit={submit}>
            <label className="field-label">Il tuo nome<input value={name} onChange={(event) => setName(event.target.value.slice(0, 24))} placeholder="Es. Mattia" autoComplete="nickname" /></label>
            {tab === "join" ? (
              <label className="field-label">Codice sala<input className="room-code-input" value={code} onChange={(event) => setCode(cleanCode(event.target.value))} placeholder="ABC123" maxLength={6} autoCapitalize="characters" /></label>
            ) : (
              <div className="create-options">
                <label className="field-label">Giocatori<select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{[2, 3, 4, 5, 6].map((number) => <option key={number} value={number}>{number} giocatori</option>)}</select></label>
                <label className="field-label">Vittoria<span className="static-field"><b>Obiettivo Challenge</b><small>16 carte · 86 punti</small></span></label>
                <label className="field-label field-wide">Durata<select value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))}><option value={90}>Challenge principale · 90 min + sdadata</option><option value={60}>Time attack · 60 min + sdadata</option><option value={45}>Time attack · 45 min + sdadata</option><option value={0}>Senza limite</option></select></label>
              </div>
            )}
            {tab === "create" && maxPlayers === 2 && <p className="info-note">Nel duello, 14 territori neutrali rendono la mappa più tattica e bilanciata.</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button full-button" disabled={busy || (tab === "join" && code.length !== 6)}>{busy ? "Preparazione della mappa…" : tab === "create" ? "Crea la sala privata" : "Entra nella sala"}</button>
          </form>
          <div className="secure-note"><span>✓</span> Nessuna registrazione · sala accessibile solo con codice</div>
        </div>
      </section>
      <BoardPreview />
      <footer className="landing-footer"><span>Dominio Globale è un gioco originale di conquista strategica ispirato ai classici del genere.</span><button onClick={() => setRulesOpen(true)}>Come si gioca</button></footer>
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  );
}

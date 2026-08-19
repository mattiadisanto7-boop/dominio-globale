# Dominio Globale

Gioco online di conquista strategica per **2–6 giocatori**, pronto per GitHub e Render.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mattiadisanto7-boop/dominio-globale)

Premi il pulsante qui sopra per creare automaticamente su Render il servizio web e il database PostgreSQL descritti in `render.yaml`.

## Funzioni principali

- stanze private con codice di sei caratteri;
- sincronizzazione online, riconnessione e salvataggio persistente;
- tabellone vettoriale realistico con 42 territori cliccabili, rotte marittime e pedine a forma di carro armato colorato con conteggio delle armate;
- esclusivamente le 16 carte-obiettivo grafiche Challenge, tutte connesse e da 86 punti, disegnate con le stesse sagome reali del tabellone;
- territori della missione indicati con il colore personale: pieno e intenso se controllati, chiarissimo se ancora da conquistare, sia sulla plancia sia sulla carta obiettivo;
- schieramento iniziale alternato: 3 armate per passaggio, piazzate una alla volta anche su tre territori differenti, e passaggio automatico all'attacco dopo l'ultimo rinforzo;
- dadi animati e conteggio regolamentare: un solo clic dell'attaccante lancia automaticamente attacco 3/2/1 con 4+/3/2 armate e difesa 3/2/1 con 3+/2/1 armate;
- blocco preventivo degli attacchi che potrebbero azzerare la partenza: 2 armate non possono attaccarne 2 o più, 3 armate non possono attaccarne 3 o più;
- presidio minimo di 2 armate quando uno spostamento volontario parte da un territorio confinante con il nemico; l'eccezione viene applicata automaticamente quando l'occupazione minima dopo una conquista costringe a lasciarne una;
- celebrazione a tutto schermo, particelle e fanfara quando un giocatore completa la conquista di un continente;
- carta appena pescata mostrata soltanto al proprietario e pulsante **Carte** per consultare l'intero mazzo privato anche durante i turni avversari;
- paesaggio sonoro militare sintetizzato dal browser: cingoli e metallo per gli schieramenti, dadi, artiglieria, conquiste, turni, carte e messaggi;
- rinforzi, fortificazione, carte territorio, tris Challenge, jolly ed eliminazioni;
- modalità principale Challenge da 90 minuti, con timer avviato soltanto dopo l'ultimo piazzamento iniziale: completamento del giro in corso, ultimo giro completo e sdadata automatica con 2 dadi, soglia crescente da 4 a 7 e salto del lancio dopo 3 o più conquiste nel turno;
- riempimento dei posti liberi con bot strategici che schierano, rinforzano, attaccano, conquistano, spostano e pescano carte usando lo stesso motore di regole dei giocatori;
- chat, registro eventi, statistiche, tutorial e interfaccia responsive.

Il progetto usa **Next.js**, **React** e **PostgreSQL**. Nome, grafica e codice sono originali e non rappresentano un prodotto ufficiale RisiKo!.

## Pubblicazione rapida: GitHub + Render

### 1. Carica il progetto su GitHub

1. Estrai lo ZIP.
2. Su GitHub crea un nuovo repository vuoto, per esempio `dominio-globale`.
3. Carica nella radice del repository tutti i file estratti, incluso `render.yaml`.
4. Conferma il commit sul branch `main`.

In alternativa, da terminale:

```bash
git init
git add .
git commit -m "Prima versione di Dominio Globale"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/dominio-globale.git
git push -u origin main
```

### 2. Pubblica tutto su Render

1. Apri la Dashboard di Render.
2. Seleziona **New → Blueprint**.
3. Collega il repository GitHub appena creato.
4. Render leggerà automaticamente `render.yaml` e mostrerà:
   - il servizio web `dominio-globale`;
   - il database `dominio-globale-postgres`.
5. Premi **Apply/Deploy** e attendi la fine della build.
6. Apri l'indirizzo `.onrender.com` assegnato al servizio.

Non devi impostare manualmente `DATABASE_URL`: il Blueprint collega il database in automatico. Le tabelle vengono create alla prima richiesta.

> Il piano gratuito di Render è adatto alle prove, ma il database PostgreSQL gratuito scade dopo 30 giorni. Per conservare le partite più a lungo, passa il database a un piano persistente prima della scadenza.

## Avvio sul computer

Prerequisiti: Node.js 20+ e Docker Desktop.

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run dev
```

Apri `http://localhost:3000`.

## Comandi

```bash
npm run dev        # sviluppo
npm run lint       # controllo ESLint
npm run typecheck  # controllo TypeScript
npm run import:board # rigenera le 42 sagome interattive dal tabellone SVG
npm run validate:dice # verifica le regole automatiche 3/2/1 dei dadi
npm run validate:flow # simula schieramento, presidio, continente, sdadata, battaglia e privacy
npm run validate:objectives # verifica 16 carte, connessione e 86 punti
npm run build      # build di produzione
npm run start      # avvio della build
```

## Note tecniche

- Le credenziali delle stanze restano nel `localStorage` del browser.
- Sul server vengono salvati solo gli hash SHA-256 dei token di accesso.
- Gli aggiornamenti usano un numero di versione per evitare sovrascritture concorrenti.
- Gli effetti audio non richiedono file esterni: sono generati in tempo reale con Web Audio e possono essere disattivati.
- Il tabellone SVG e la geometria territoriale estratta seguono la licenza CC BY-SA 3.0 indicata in `NOTICE.md`; il resto del codice rimane sotto la licenza del progetto.
- Il database utilizza query parametrizzate e transazioni PostgreSQL.
- `/api/health` verifica sia il servizio web sia la connessione al database.

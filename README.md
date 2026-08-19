# Dominio Globale

Gioco online di conquista strategica per **2–6 giocatori**, pronto per GitHub e Render.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mattiadisanto7-boop/dominio-globale)

Premi il pulsante qui sopra per creare automaticamente su Render il servizio web e il database PostgreSQL descritti in `render.yaml`.

## Funzioni principali

- stanze private con codice di sei caratteri;
- sincronizzazione online, riconnessione e salvataggio persistente;
- tabellone illustrato con 42 territori cliccabili, valori-confine, rotte marittime e pedine;
- esclusivamente le 16 carte-obiettivo grafiche Challenge, tutte connesse e da 86 punti;
- dadi animati, difesa interattiva fino a tre dadi ed effetti sonori sintetizzati dal browser;
- rinforzi, fortificazione, carte territorio, tris Challenge, jolly ed eliminazioni;
- modalità classica o a tempo;
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
npm run validate:objectives # verifica 16 carte, connessione e 86 punti
npm run build      # build di produzione
npm run start      # avvio della build
```

## Note tecniche

- Le credenziali delle stanze restano nel `localStorage` del browser.
- Sul server vengono salvati solo gli hash SHA-256 dei token di accesso.
- Gli aggiornamenti usano un numero di versione per evitare sovrascritture concorrenti.
- Gli effetti audio non richiedono file esterni: sono generati in tempo reale con Web Audio e possono essere disattivati.
- Il database utilizza query parametrizzate e transazioni PostgreSQL.
- `/api/health` verifica sia il servizio web sia la connessione al database.

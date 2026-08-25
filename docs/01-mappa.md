# L'app in una pagina

**Turni** è la pianificazione dei turni per aziende con squadre a orario
variabile — negozi, magazzini, ristorazione. Il responsabile costruisce la
settimana; ogni dipendente vede la sua.

Repository: `https://github.com/Nixo999/smooth-duty.git`, ramo `main`. Il nome
del progetto npm è `turni`; `smooth-duty` è solo il nome del repository su
GitHub, e la cartella locale si chiama diversamente su ogni macchina — si
lavora da più di una, l'elenco sta in [06-ambiente.md](06-ambiente.md).

## Chi la usa

Tre livelli, e sono davvero tre cose diverse — non tre gradini dello stesso
ruolo:

| Chi | Dove vive | Cosa fa |
|---|---|---|
| **Amministratore della piattaforma** | `platform_admins`, **fuori** da ogni azienda | crea le aziende e il loro primo responsabile |
| **Responsabile** (`capo`) | `profiles.role = 'capo'` | costruisce i turni, gestisce squadra, assenze, impostazioni |
| **Dipendente** | `profiles.role = 'dipendente'` | guarda i suoi turni, chiede permessi, conferma i turni che lo richiedono |

Lo stesso account può essere amministratore **e** stare dentro un'azienda: le
due cose sono indipendenti (`Viewer` in `src/lib/types.ts`). Non esiste
registrazione pubblica: ogni account lo crea qualcun altro e nasce con
password provvisoria.

**Una persona può esistere senza account.** Da `07-persone-senza-account.sql`,
`profiles.user_id` è nullabile: chi ha `user_id = null` sta in squadra, va in
turno, compare nei conti, ma nell'app non entra. È ciò che permette di caricare
trenta nomi da un elenco senza pretendere trenta indirizzi email.

## Le schermate

```
/login                accesso (solo email+password: l'azienda si ricava dall'account)
/cambia-password      obbligatoria finché must_change_password è alzato

/turni                capo → tabellone settimanale + casella dei messaggi
                      dipendente → la sua settimana, con sì/no sui turni segnalati
/turni/importa        lettura di un foglio Excel/CSV con anteprima (solo capo)
/supervisione         la giornata ora per ora, e cosa è scoperto
/permessi             richieste di assenza: il dipendente chiede, il capo decide
/prospetto            ore lavorate, perse e per quale causale (solo capo)
/squadra              le persone, i ruoli, gli accessi (solo capo)
/impostazioni         gli interruttori dell'azienda (solo capo)

/admin                elenco aziende (solo amministratore della piattaforma)

/ferie                → redirect a /permessi (vecchio indirizzo)
/                     → smistamento secondo chi sei (destinazioneDi)
```

Il menu lo costruisce `src/app/(app)/layout.tsx`; le icone attraversano il
confine server→client come chiavi di stringa, non come componenti.

**Supervisione, Permessi e Prospetto si possono spegnere** per azienda: allora
spariscono dal menu e il loro indirizzo riporta ai Turni. Turni, Squadra e
Impostazioni no — senza il tabellone l'app non ha un motivo, e senza
Impostazioni non si riaccenderebbe più niente.

## Lo stack

Next.js **16.3.1** (App Router, Server Components e Server Actions) · React 19 ·
TypeScript · Tailwind **4** · Supabase (Postgres + Auth + RLS) · zod ·
Radix (dialog, dropdown) · lucide-react · sonner · date-fns · exceljs +
papaparse (importazione) · motion · Capacitor 8 (guscio Android).

> ⚠️ Next 16 non è il Next che conosci: il middleware si chiama `proxy.ts`,
> `searchParams` è una Promise. Il blocco in [AGENTS.md](../AGENTS.md) lo dice,
> e la documentazione vera sta in `node_modules/next/dist/docs/`.

## L'architettura in una frase

Le pagine sono **Server Component** che leggono da Supabase con le colonne
dichiarate in `src/lib/colonne.ts`, calcolano con **funzioni pure** in
`src/lib/` (che si provano senza browser e senza database) e passano tutto a
componenti client che scrivono tramite **Server Action**; l'isolamento fra
aziende non è nel codice, è in **RLS**.

```
src/app/(gruppo)/pagina/page.tsx     legge (Server Component)
src/app/(gruppo)/pagina/actions.ts   scrive (Server Action, "use server")
src/components/<area>/               disegna e interagisce ("use client")
src/lib/<motore>.ts                  calcola (puro, provabile a riga di comando)
supabase/NN-*.sql                    definisce e protegge
```

## I motori puri

Sono il cuore, e stanno tutti fuori dai componenti apposta: si provano con
`npm run prove`, senza aprire un browser.

| File | Risponde a |
|---|---|
| `src/lib/supervisione/copertura.ts` | chi c'è ora, e la giornata è coperta? |
| `src/lib/prospetto.ts` | quante ore ha fatto ciascuno, e quante ne ha perse |
| `src/lib/import/parse.ts` | cosa c'è scritto in questo foglio Excel |
| `src/lib/turni-staging.ts` | come si accumulano le modifiche prima di spedirle |
| `src/lib/supervisione/trascina.ts` | dove finisce una barra trascinata |
| `src/lib/generazione.ts` | chi ci metteresti, in questa settimana vuota? |

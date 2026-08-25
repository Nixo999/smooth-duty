# Come si scrive codice qui

Non sono preferenze di stile. Ognuna di queste risolve un problema che si è
già presentato, e disattenderla lo fa tornare.

## Le date sono civili, mai istanti

Tutta l'app ragiona su stringhe `YYYY-MM-DD`, non su `Date` con orario. Un
turno del 3 marzo resta del 3 marzo per chiunque lo guardi: salvando un
`timestamptz`, chi apre l'app da un altro fuso vedrebbe il turno spostato di un
giorno.

Corollari:
- le date a lunghezza fissa **si confrontano direttamente** con `<` e `<=`:
  l'ordine alfabetico e quello cronologico coincidono. Passare da oggetti
  `Date` riapre solo il problema dei fusi;
- quando serve costruire un `Date` da una data civile, si usa **mezzogiorno**
  (`new Date(iso + "T12:00:00")`): a mezzanotte un'ora avanti o indietro
  cambia il giorno;
- la settimana comincia **di lunedì**, ovunque (`weekStart`,
  `date_trunc('week')` in Postgres fa lo stesso);
- gli orari sono `HH:MM:SS` sul database e `HH:MM` nell'interfaccia
  (`hhmm()`), perché `<input type="time">` vuole i secondi via;
- **«oggi» si chiede a `oggiCivile()`**, mai a `new Date()`. In produzione il
  server gira in UTC: fra mezzanotte e le due italiane è ancora al giorno
  prima, e una regola che dipende da «è già passato?» darebbe due risposte
  diverse a seconda di chi la applica. Il fuso è `Europe/Rome` (`FUSO` in
  `lib/date.ts`) ed è scritto **anche** nelle funzioni del database
  (`accetta_turno`, `rifiuta_turno`): le due parti devono rispondere la stessa
  cosa, o il browser mostra un bottone che il server rifiuta.

## Il confine server / client

- `page.tsx` è un **Server Component**: legge, e passa dati serializzabili.
  Niente componenti, niente funzioni, niente icone attraverso il confine — per
  questo `AppShell` riceve una **chiave** di icona e la mappa sta nel client.
- Si scrive **solo** da Server Action (`"use server"`). Ogni funzione esportata
  da un file `"use server"` è un punto di ingresso chiamabile dal browser: per
  questo `src/lib/persone.ts` **non** è `"use server"` — accetta l'azienda come
  parametro, e là dentro sarebbe un modo per scrivere nell'azienda di
  qualcun altro.
- `import "server-only"` su tutto ciò che non deve mai finire nel bundle:
  `lib/auth.ts`, `lib/supabase/admin.ts`, `lib/persone.ts`. La build fallisce
  se ci finisce.
- Ogni azione comincia con la sua guardia — `requireMember()`, `requireCapo()`,
  `requirePlatformAdmin()` — e valida l'input con **zod** prima di toccare il
  database.
- Dopo aver scritto, `revalidatePath()` su **tutte** le pagine toccate. Un
  turno cambia i Turni *e* la Supervisione; un'assenza cambia anche Prospetto e
  Squadra; le impostazioni cambiano quasi tutto.

## Le colonne stanno in un posto solo

`src/lib/colonne.ts`. Ogni volta che si aggiunge un campo va aggiornato
ovunque: dimenticarne una pagina produce un `undefined` che non somiglia a un
errore e si scopre settimane dopo.

`COLONNE_PROFILO_CON_REPARTI` restituisce i reparti annidati: vanno appiattiti
con `conReparti()` prima di usarli.

## Le funzioni condivise esistono per non divergere

Ogni volta che la stessa domanda viene fatta da due punti, la risposta sta in
un file solo. Non è astrazione per bellezza: è che due risposte diverse
producono bug che sembrano fantasmi.

| File | Domanda |
|---|---|
| `lib/reparto.ts` | di che reparto è questo turno? |
| `lib/ricerca.ts` | questo nome corrisponde a quello che sto scrivendo? |
| `lib/elenco.ts` | quanti nomi ci sono in questo elenco incollato? |
| `lib/week.ts` | quali giorni tocca questa copia? |
| `lib/turni-staging.ts` | come si accumulano le modifiche? |
| `lib/impostazioni.ts` | qual è il default quando la riga non c'è? |
| `lib/conferme.ts` | a che punto sta un turno rifiutabile? |
| `lib/supervisione/trascina.ts` | dove finisce una barra trascinata? |

## RLS, e perché non basta

- Mai una policy che interroga una tabella a sua volta protetta: ricorsione
  infinita, errore `42P17`. Si passa da funzioni `SECURITY DEFINER`.
- Per concedere **un solo campo** a un utente si scrive una funzione
  `SECURITY DEFINER`, non una policy di `update`: la policy aprirebbe tutta la
  riga.
- I vincoli di coerenza fra aziende stanno in **trigger**, non nel codice: così
  valgono per interfaccia, importazione, script e per qualunque strada venga
  dopo.
- **RLS è la rete, non il filtro.** Le pagine mettono comunque
  `.eq("company_id", ...)`: l'amministratore della piattaforma ha il permesso
  di leggere i profili di tutte le aziende, e senza quella riga si ritroverebbe
  in squadra le persone altrui.

## Un errore di lettura non si traveste da elenco vuoto

È il peggior spavento che questa app abbia fatto prendere a qualcuno. Le pagine
leggevano con `data ?? []`, e un errore diventava un elenco vuoto: **un
tabellone senza turni è indistinguibile da un tabellone cancellato**, solo che
nel primo caso i turni sono tutti lì e a non funzionare è la domanda.

Le letture che *sono* la pagina (i turni, le persone) controllano `.error` e
mostrano `<ErroreDati>`. Succede tipicamente dopo un aggiornamento quando le
migrazioni SQL non sono state eseguite: il codice chiede colonne che nel
database non esistono ancora, e Postgres rifiuta l'intera interrogazione — per
questo il componente riconosce `column ... does not exist` e lo dice.

## Colori e tema

I colori stanno **solo** in `src/app/globals.css`, come token
(`--surface`, `--text-muted`, `--accent`, `--danger`, `--success`,
`--warning`…), con la versione chiara e quella scura. I componenti usano le
classi (`bg-surface`, `text-muted`, `bg-accent`), **mai un colore scritto a
mano**: è l'unico modo perché chiaro e scuro restino coerenti mentre l'app
cresce. Tailwind 4, quindi la configurazione è nel CSS, non in un file JS.

I reparti salvano una **tinta** (0–360), non un colore finito: il colore lo
compone il foglio di stile, perché chiaro e scuro hanno bisogno di due
luminosità diverse.

## I motori si provano senza browser

I calcoli stanno in funzioni **pure** dentro `src/lib/`, fuori dai componenti,
e si provano con `npm run prove` — che gira davvero, senza database e senza
server. È una scelta di progetto: un calcolo dentro un componente si può solo
guardare a occhio.

## Lingua

Interfaccia, nomi di dominio, **commenti e nomi di funzione in italiano**
(`salvaTurno`, `chiediPermesso`, `copertura`, `assenzaDelGiorno`). Restano in
inglese i nomi delle tabelle e delle colonne, e qualche componente della prima
ora (`Roster`, `MyWeek`, `Squadra` sta in mezzo).

I commenti spiegano **perché**, non cosa: quasi tutti raccontano il problema
che quella riga evita. È lo stesso criterio dei messaggi di commit — «Un'assenza
costa le ore da contratto, non i turni che erano scritti», non «modificato
prospetto.ts».

## Sicurezza e segreti

- **Password mai scritte nel codice.** Gli script che creano account di prova
  non hanno password di ripiego: arrivano da fuori, perché una password nel
  codice finisce su GitHub e da lì non si toglie più.
- `.env.local` e `.env.db` sono fuori da git e non sono mai stati nella storia
  dei commit. Controllo:
  `git grep -I -l "sb_secret_" $(git rev-list --all)`.
- `SUPABASE_SERVICE_ROLE_KEY` **non deve mai avere il prefisso
  `NEXT_PUBLIC_`**: quel prefisso include il valore nel codice che arriva al
  browser, e quella chiave scavalca ogni regola di sicurezza.

## Prestazioni: le tre cose già imparate

Sono costate misurazioni vere, e si perdono facilmente rifattorizzando.

1. **`getViewer()` è memorizzata con `cache()`** — gira una volta per
   *richiesta*, non per chiamata. Senza, ogni pagina la eseguiva tre volte, e
   ogni giro è un `auth.getUser()` più due letture: mezzo secondo buttato prima
   ancora di leggere i turni. Legge inoltre in **anticipo ottimistico** l'id
   dal cookie, in parallelo alla validazione (che resta obbligatoria).
2. **`proxy.ts` rinnova il token solo quando sta per scadere** (< 120 s). Prima
   ogni click e ogni prefetch pagavano un giro fino a Supabase per sentirsi
   dire che non c'era niente da rinnovare.
3. **La regione delle funzioni deve stare vicina al database.** Le pagine
   girano in funzioni server: Netlify le mette di default in Ohio, il database
   Supabase sta in Irlanda. Ogni giro costa ~90 ms invece di ~10, e le pagine
   ne fanno due o tre.

## Trappole già incontrate

- **Su iPhone il mouse non passa mai**: un menu che si apre in `hover` non si
  apre. Vale per i menu Radix dell'intestazione.
- **`.xls`** (Excel vecchio) non è leggibile da exceljs: si rifiuta con
  l'istruzione per convertirlo, non si prova.
- **Insert enormi**: oltre qualche centinaio di righe una singola insert supera
  i limiti della richiesta e fallisce senza dire perché. L'importazione va a
  blocchi da 500.
- **`draft_weeks` non esiste più.** Un documento che la nomina è più vecchio
  del 25 agosto 2026.
- **Le conferme sono rovesciate** dal 25 agosto 2026: il turno vale subito e si
  rifiuta. Un documento che parla di turni «appesi in attesa del sì» descrive
  l'app di prima. `conferma_turno()` non esiste più; le colonne si chiamano
  ancora `conferma_*` per non pagare una migrazione di soli nomi.

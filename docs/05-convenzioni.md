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
| `lib/generazione.ts` | chi mettere sui buchi di una settimana? |
| `lib/ore-effettive.ts` | questo turno lo farà davvero qualcuno? |
| `lib/pubblicazione.ts` | chi sta sotto le sue ore da contratto? |
| `lib/disponibilita.ts` | a chi è a chiamata, questo turno si può dare? |

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

## Animazioni: un vocabolario, e `motion` solo dove il CSS non arriva

Le animazioni dell'app sono **CSS**, e stanno tutte in `globals.css` come
token `--animate-*` con i loro `@keyframes`: `fade-in`, `rise` (6 px),
`pop` (scala 0,97), `sheet-up` (14 px), le entrate di pagina (32 px), e dal
2 settembre 2026 le **uscite** — `fade-out`, `sheet-down`, `pop-out` —
che prima non c'erano: modali e tendine sparivano di colpo, e lo scatto si
notava proprio perché l'ingresso era morbido. Le regole che tengono insieme
il tutto:

- **due curve, e sono token**: `--curva-entrata` (chi arriva frena) e
  `--curva-uscita` (chi se ne va accelera), definite in `:root` e citate da
  ogni `--animate-*`, da `.tap`, dal passaggio di pagina e — come costanti
  `CURVA_ENTRATA` / `CURVA_USCITA` in `ui/movimento.tsx` — dal codice. Non se
  ne scrivono più a mano;
- **anche le utility `transition-*` di Tailwind girano su quella curva**:
  `--default-transition-timing-function` e `--default-transition-duration`
  (0,14 s, come `.tap`) sono ridefinite nel `@theme`. Una transizione nuda
  eredita la curva dell'app, non quella di Tailwind;
- **le uscite sono più corte delle entrate** (0,14–0,2 s contro 0,18–0,3 s):
  una cosa che se ne va non deve farsi guardare;
- **la dose è piccola**: 6 px, 14 px, scala 0,97. Un'app che si usa cento
  volte al giorno non deve sembrare una presentazione;
- la risposta al tocco la dà solo l'elemento premuto (`.tap`); ogni
  `<details>` aperto fa entrare il contenuto con `rise` — regola
  sull'elemento, non classe da ricordare — e la freccia è `ui/freccia.tsx`;
- la tendina di Radix ha la sua stringa in `TENDINA` (`lib/utils.ts`), come
  `BARRA_AZIONI`: l'animazione di chiusura è lì una volta, non in cinque
  file;
- **`prefers-reduced-motion` vale ovunque**: il blocco in fondo a
  `globals.css` azzera tutto, e il provider di `motion` fa lo stesso con
  `reducedMotion="user"`. Niente guardie `motion-reduce:` per elemento.

**`motion`** (`motion/react`, in `package.json` dal primo giorno) entra solo
per le due cose che il CSS non sa fare bene: un elemento che deve animarsi
**dopo** essere uscito dall'albero (`AnimatePresence`, es. la pastiglia di
salvataggio delle Impostazioni) e un **numero che scorre** da un valore
all'altro (`useMotionValue` + `animate`, es. le ore lavorate del Prospetto —
il valore vive nel `MotionValue`, React non ri-renderizza a ogni frame). Si
usa **sempre e solo `m.*`**, mai `motion.*`: il provider `Movimento`, alla
radice di `AppShell`, carica `domMin` (animazioni e uscite, niente gesti) in
modalità `strict`, e `motion.div` rompe la resa apposta — è il modo in cui
non ci si porta dietro il pacchetto intero senza accorgersene. Costa ~24 KB
compressi su ogni rotta dell'app: è il prezzo dichiarato di averla ovunque.

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

## Come si difende l'ingresso

L'app sta su internet e protegge le causali di malattia e legge 104: l'ingresso
è la porta di tutto il resto.

**Quello che c'era già, e non è poco**: il traffico è cifrato (HTTPS, con HSTS
messo da Netlify), le password non sono in nessuna nostra tabella — le tiene
Supabase, con hash e sale — e i dati sono cifrati a riposo dal database. Non
c'è nessuna «cifratura da aggiungere» sopra a questo: scriverne una nostra
sarebbe più debole di quella che c'è.

**Quello che è stato aggiunto il 26 agosto 2026:**

- **Un tetto ai tentativi.** Una password si indovina provando, e da internet
  «provando» vuol dire migliaia di tentativi al minuto. Due chiavi insieme:
  per indirizzo (10 in 15 minuti) contro chi prende di mira una persona, e per
  provenienza di rete (50 in 15 minuti) contro chi prova la stessa password su
  tutta l'azienda — quel secondo caso al primo limite sfuggirebbe, perché fa un
  tentativo solo per indirizzo. Contano solo i falliti; entrare azzera.
  ⚠️ Quando la provenienza **non si sa**, il limite per rete non si applica
  affatto invece di valere per tutti insieme: un contatore unico chiuderebbe
  fuori un'azienda intera per errori di sconosciuti.
- **Le funzioni del contatore non sono pubbliche.** In Postgres una funzione
  nuova nasce eseguibile da chiunque: senza la revoca, chi sta provando
  password potrebbe chiamare da sé `azzera_tentativi` e togliersi il blocco.
- **Niente elenchi regalati.** L'errore dell'accesso è generico, e il recupero
  password risponde uguale che l'indirizzo esista o no. Costa una scomodità a
  chi digita male; l'alternativa è un modo per sapere chi lavora qui.
- **Password di almeno 10 caratteri**, senza obbligo di maiuscole e simboli:
  quelli producono `Password1!` su metà delle scrivanie, che è peggio di una
  frase lunga. La lunghezza è ciò che conta contro chi prova.
- **Intestazioni di sicurezza** (`next.config.ts`): `X-Frame-Options: DENY` e
  `frame-ancestors 'none'` — nessuno può incorniciare l'app sul proprio sito e
  raccogliere i click di chi crede di premere altro; `Referrer-Policy`, perché
  uscendo non si porta l'indirizzo completo (dentro c'è la settimana che si
  guardava, e di chi); `Permissions-Policy`, che spegne fotocamera, microfono e
  posizione — l'app non li usa, e dichiararlo impedisce che una dipendenza li
  chieda di nascosto. Via anche `X-Powered-By`: la versione del framework serve
  solo a sapere in fretta quali falle provare.

**Quello che NON c'è, dichiarato invece che sottinteso:**

- **una Content-Security-Policy completa.** Con Next vuol dire firmare ogni
  script con un nonce a ogni richiesta; una CSP incollata alla leggera o rompe
  l'app o si riduce a `unsafe-inline`, che è teatro. C'è solo
  `frame-ancestors`, che si può dare subito e vale da sola;
- **il secondo fattore.** Supabase lo supporta; è una scelta di prodotto da
  fare, non una riga da aggiungere;
- **un tetto ai tentativi per l'amministratore della piattaforma** oltre a
  quelli di Supabase: passa dalla stessa `accedi`, quindi è coperto, ma il suo
  recupero password non passa da qui (vedi [08-aperto.md](08-aperto.md)).

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

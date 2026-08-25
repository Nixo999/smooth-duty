# Turni

Pianificazione turni per squadre e aziende. Il responsabile costruisce la
settimana, ogni dipendente vede la sua.

> Questo file spiega come si installa e come funziona l'app. Per **lavorare al
> codice** — modello dei dati, regole di dominio, convenzioni, diario delle
> modifiche — la memoria del progetto sta in [`docs/`](docs/README.md).

## Avvio in locale

### 1. Il database

Serve un progetto Supabase (gratuito).

1. Vai su [supabase.com](https://supabase.com) → **New project**.
2. A progetto creato, apri **SQL Editor** → **New query** ed esegui **tutti**
   i file di [`supabase/`](supabase) **in ordine di numero**, da
   [`01-schema.sql`](supabase/01-schema.sql) fino all'ultimo. Sono
   incrementali: ognuno dà per fatto quello prima, e fermarsi a metà lascia
   un database a cui l'app chiederà colonne che non esistono.
3. Apri **Project Settings › API** e copia tre valori.

### 2. Le chiavi

Copia `.env.local.example` in `.env.local` e riempilo:

```
NEXT_PUBLIC_SUPABASE_URL=https://<il-tuo-progetto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Project API keys › anon public>
SUPABASE_SERVICE_ROLE_KEY=<Project API keys › service_role>
```

`service_role` scavalca ogni regola di sicurezza: resta solo sul server, non
va committata e non deve mai finire in una variabile `NEXT_PUBLIC_`.

Serve solo a chi lancia gli script di migrazione: `.env.db.example` → `.env.db`,
con la password del database (**Project Settings › Database**). L'API REST di
Supabase non sa creare tabelle, quindi quegli script parlano con Postgres
direttamente.

### 3. Il server

```bash
npm run dev
```

### 4. Il primo amministratore

Non esiste una pagina pubblica per registrarsi: sarebbe una porta aperta.
L'amministratore della piattaforma si crea una volta sola, a mano.

1. In Supabase, **Authentication › Users › Add user**, con **Auto Confirm User**
   attivo. È l'unico account che nasce così.
2. Nel **SQL Editor**, promuovilo:

```sql
insert into public.platform_admins (user_id, email)
select id, email from auth.users where email = 'tua@email.it'
on conflict (user_id) do nothing;
```

Da lì in poi tutto passa dall'interfaccia: l'amministratore crea le aziende
con il loro responsabile, il responsabile aggiunge i dipendenti.

## Chi crea chi

```
amministratore  →  azienda + suo responsabile
responsabile    →  dipendenti della sua azienda
```

Ogni account creato da qualcun altro nasce con una **password provvisoria**:
chi lo crea la genera, la copia e la consegna. Al primo accesso l'app non
lascia andare da nessun'altra parte finché la persona non ne sceglie una sua
(`must_change_password` su `profiles`, azzerato solo dalla funzione
`mark_password_changed()`).

## Provare l'app

### Dal telefono, sulla stessa rete Wi-Fi

```bash
npm run build
npm run start:rete
```

Poi dal telefono apri `http://<ip-del-computer>:3000` (su questa macchina
`192.168.1.213`). È la strada più veloce e non richiede nient'altro.

⚠️ Su un indirizzo `http` di rete locale il browser **non** propone
l'installazione: i service worker girano solo su HTTPS o su localhost. È una
regola di sicurezza dei browser, non un difetto dell'app. Per l'icona sulla
schermata iniziale serve l'una o l'altra delle strade qui sotto.

### Come app installata (PWA)

Quando l'app è pubblicata su un indirizzo HTTPS, dal telefono si aggiunge alla
schermata iniziale e da lì parte a schermo intero, senza barra del browser:
manifest, icone e service worker sono già a posto.

Il service worker è volutamente prudente: mette in cache **solo** i file
statici, mai le pagine. Un tabellone salvato in cache ricomparirebbe al
collega che usa lo stesso telefono, mostrando turni vecchi come se fossero
quelli veri.

### Come APK Android

L'app ha del codice che gira sul server, quindi non si può impacchettare in
file statici: l'APK è una finestra nativa che apre l'app dove sta girando
davvero. L'indirizzo si imposta in [`capacitor.config.ts`](capacitor.config.ts).

```bash
npm run build
npm run apk
```

Il file esce in `android/app/build/outputs/apk/debug/app-debug.apk`. Va
copiato sul telefono e aperto, autorizzando l'installazione da origini
sconosciute.

Per compilarlo servono JDK 21 e l'SDK Android. Su questa macchina `JAVA_HOME`
punta al JDK 19 perché serve ad altri progetti, quindi il JDK da usare è
scritto in [`android/gradle.properties`](android/gradle.properties) e vale
solo per questa build.

⚠️ L'APK di prova punta a un indirizzo di rete locale: funziona finché il
telefono è sullo stesso Wi-Fi e il server è acceso. Per una versione da
consegnare va sostituito con l'indirizzo pubblico HTTPS e va tolto
`cleartext`.

## Come funziona

- **Accesso** — solo email e password. L'azienda si ricava dall'account, così
  chi entra non deve ricordare codici.
- **Turni** — il responsabile vede il tabellone della settimana (persone in
  riga, giorni in colonna) e clicca una cella per aggiungere. Da telefono la
  griglia diventa un giorno alla volta. Il dipendente vede solo i suoi.
- **Copia turni** — si sceglie cosa copiare (una settimana intera o un solo
  giorno), da quando e su quando. Prima di premere mostra quanti turni ci sono
  nell'origine e quanti ne verrebbero travolti nella destinazione. Le
  impostazioni di partenza ricopiano la settimana precedente su quella aperta,
  che è il caso di gran lunga più frequente.
- **Importazione da Excel o CSV** — legge il foglio, mostra cosa ha capito e
  salva solo dopo conferma. Vedi sotto.
- **Squadra** — il responsabile crea gli account, assegna i ruoli, sospende
  chi non deve più entrare.
- **Supervisione** — la giornata reparto per reparto, con i buchi di
  copertura. In modalità Modifica le barre si trascinano: i bordi cambiano
  l'orario, il centro sposta il turno, anche di reparto dove la persona sa
  lavorare.
- **Sì e no sui turni** — un turno particolare vale subito; l'interessato può
  accettarlo o rifiutarlo, e il responsabile vede sul tabellone a che punto
  sta: in attesa, accettato, rifiutato. I rifiuti diventano messaggi in cima
  ai Turni. Vedi sotto.
- **Impostazioni** — le regole dell'azienda, divise per pagina. Supervisione,
  Permessi e Prospetto si possono spegnere: chi non le usa non se le ritrova
  nel menu.

## Le decisioni che contano

**L'isolamento fra aziende è nel database, non nel codice.** Ogni tabella ha
RLS attivo e le policy confrontano `company_id` con quello di chi sta
chiedendo. Anche se una pagina sbagliasse una query, i dati di un'altra
azienda non uscirebbero. Le policy leggono azienda e ruolo tramite funzioni
`SECURITY DEFINER` (`current_company_id()`, `is_capo()`): una policy che
interroga direttamente una tabella a sua volta protetta manda Postgres in
ricorsione infinita (errore 42P17).

**Il turno vale subito, e semmai lo si rifiuta.** Uno straordinario, un turno
cambiato dopo la pubblicazione, un orario diverso da quello del contratto: il
turno è preapprovato — vale, si vede, si conta — e l'interessato ha la facoltà
di dire di no. Chi tace ha accettato, che è il caso di gran lunga più
frequente, e il responsabile non resta fermo ad aspettare chi non apre l'app
per due giorni. Un rifiuto lascia un messaggio, e l'effetto scatta quando il
responsabile lo apre: se quel turno esisteva già torna com'era, se era nato
adesso se ne va e resta un buco dichiarato da coprire. Le richieste di
permesso vanno nel verso opposto — nascono con riserva e valgono solo quando
il responsabile le approva — perché un'assenza data per buona in attesa di
smentita è un buco in turno che nessuno ha visto arrivare.

**Ma dire di sì e non dire niente non sono la stessa cosa**, e sul tabellone
si distinguono: *in attesa* (arancio) è il turno che vale e su cui nessuno si
è ancora espresso, *accettato* (verde) quello che l'interessato ha guardato e
approvato, *rifiutato* (rosso) quello su cui c'è un messaggio da leggere. Il
sì non serve a rendere valido niente — il turno lo era già — serve a togliere
il responsabile dal dubbio il sabato sera. Una volta detta, la parola vale:
quello che si è accettato non si rifiuta più, e chi ha un imprevisto vero
chiede un permesso, che è l'altra strada e c'è apposta.

**I turni sono date civili, non istanti.** Un turno del 3 marzo resta del
3 marzo per chiunque lo guardi. Se salvassimo un `timestamptz`, chi apre l'app
da un altro fuso vedrebbe il turno spostato di un giorno.

**La copia fa corrispondere i giorni per posizione**, non per differenza di
date: il lunedì finisce sul lunedì anche saltando avanti di mesi. Contando i
giorni si sbaglierebbe attraversando il cambio dell'ora, dove una settimana
non dura 168 ore esatte.

**I turni oltre la mezzanotte** si riconoscono da `end_time <= start_time` e
valgono sul giorno dopo: è `durationMinutes()` in `src/lib/date.ts` a
gestirlo, e l'interfaccia lo dichiara esplicitamente.

**L'importazione si controlla da sola.** I tabelloni reali hanno una colonna
`TOT` con le ore di ogni giorno. Il lettore ricalcola quelle ore dagli orari e
le confronta con quella colonna: se non coincidono ha letto male una casella, e
lo dice prima di salvare invece di importare dati sbagliati in silenzio. È il
controllo che rende sicuro un parser scritto a mano.

Riconosce due strutture. La **larga** — una riga per persona, ogni giorno su
più colonne `Da | A | Da | A | TOT`, che permette il turno spezzato — e
l'**elenco**, una riga per turno con colonne Nome, Data, Da, A. Le caselle che
non sono orari (`R` riposo, `F` ferie, `A` assenza, `M` malattia, `P` permesso)
vengono riconosciute e non diventano turni.

**Un rifiuto ha effetto quando il responsabile lo legge**, non quando il
dipendente preme. Il turno resta com'è, marcato rifiutato, finché il
responsabile non apre i messaggi: solo lì torna com'era o sparisce. Farlo
scattare subito vorrebbe dire trovarsi il tabellone cambiato senza sapere né
quando né perché — e la spiegazione arriverebbe dopo il fatto, invece che
insieme. Se nel frattempo quel turno il responsabile l'aveva già cambiato di
suo, il rifiuto non tocca niente: l'ultima parola è la sua, e un ripristino
gli cancellerebbe il lavoro.

**I colori stanno solo in `globals.css`.** I componenti usano i token
(`bg-surface`, `text-muted`, `bg-accent`), mai un colore scritto a mano: è
l'unico modo perché chiaro e scuro restino coerenti mentre l'app cresce. I
grigi del testo stanno sopra il rapporto di contrasto 4.5 anche a 11px: sotto,
un'etichetta si legge solo da vicino e con la luce giusta.

## Struttura

```
src/
  app/
    (auth)/            accesso e cambio password obbligatorio
    (admin)/           amministrazione: elenco e creazione aziende
    (app)/turni/       tabellone del responsabile · settimana del dipendente
    (app)/supervisione/ la giornata per reparti, con le barre da trascinare
    (app)/permessi/    richieste di assenza · (app)/prospetto/ ore per persona
    (app)/squadra/     gestione delle persone
    (app)/impostazioni/ le regole dell'azienda, divise per pagina
  components/
    ui/                bottone, campi, finestra, tema, recinto dei comandi
    turni/             tabellone, finestra turno, importazione, messaggi
    supervisione/  permessi/  prospetto/  squadra/  admin/
  lib/
    supabase/          client browser · server · service_role
    auth.ts            chi sta usando l'app, con guardie per le pagine
    date.ts            settimane, durate, turni a cavallo della mezzanotte
    colonne.ts         le colonne chieste a Supabase, in un posto solo
    impostazioni.ts    le regole dell'azienda, coi valori di ripiego
    turni-staging.ts   le modifiche in sospeso, condivise fra le due pagine
    supervisione/      copertura e buchi · matematica del trascinamento
    import/            lettura del foglio, riconoscimento, abbinamento nomi
supabase/*.sql         tabelle e regole di accesso, in ordine numerico
android/               guscio Capacitor per l'APK di prova
scripts/               prove senza framework (`npm run prove`), icone, seed
```

## Pubblicare

Su Netlify o Vercel il progetto si riconosce da solo e non serve nessuna
configurazione, ma **le variabili d'ambiente vanno impostate a mano**:
`.env.local` non sta in git, quindi lassù l'app non sa a quale Supabase
collegarsi. Senza, la prima pagina risponde «Your project's URL and Key are
required to create a Supabase client».

| Variabile | Valore |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | l'indirizzo del progetto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la *publishable key* |
| `SUPABASE_SERVICE_ROLE_KEY` | la *secret key* |

⚠️ La terza **non deve mai avere il prefisso `NEXT_PUBLIC_`**: quel prefisso
dice a Next.js di includere il valore nel codice che arriva al browser, e la
chiave che scavalca ogni regola di sicurezza diventerebbe leggibile a
chiunque apra il sito.

Le variabili si leggono in fase di build: dopo averle aggiunte serve un nuovo
deploy, non basta ricaricare.

⚠️ **La regione delle funzioni deve stare vicina al database.** Le pagine
girano in funzioni server, e Netlify le mette di default in **Ohio
(us-east-2)**; il database Supabase sta in **Irlanda (eu-west-1)**. Ogni
pagina fa due o tre giri fino al database, e ogni giro dall'Ohio costa
~90 ms invece di ~10: sommati, e' quasi mezzo secondo regalato a ogni
click — piu' la partenza a freddo della funzione, che dall'Italia si paga
tutta. In Netlify: **Project configuration → Build & deploy → Functions →
Region**, scegliere `eu-west-1` (Irlanda), poi rifare il deploy.

⚠️ **Prima di lasciare il sito raggiungibile**, cambia la password
dell'amministratore. Su localhost una password debole è un fastidio teorico;
su internet è la porta d'ingresso a tutte le aziende, e alle causali di
malattia e legge 104 che il resto dell'app protegge con cura.

## Segreti

Nel repository non c'è nessuna credenziale, ed è una regola da tenere:

- `.env.local` (chiavi Supabase) e `.env.db` (password del database) sono
  esclusi da git, e non sono mai finiti nella storia dei commit.
- Gli script che creano account di prova **non hanno password di ripiego**:
  arrivano da fuori, perché una password scritta nel codice finisce su GitHub
  e da lì non si toglie più.

```bash
TURNI_DEMO_PASSWORD=... node --env-file=.env.local scripts/dati-di-prova.mjs
TURNI_CAPO_PASSWORD=... node --import ./scripts/alias.mjs --env-file=.env.local   scripts/carica-mediaworld.mjs "percorso/Orari.xlsx"
```

Prima di rendere pubblico questo repository vale la pena rileggere questa
sezione, e controllare la storia e non solo i file:

```bash
git grep -I -l "sb_secret_" $(git rev-list --all)
```

## Non c'è ancora

Lettura dei turni da una foto, notifiche via email e push, generazione
automatica dei turni, pubblicazione su un indirizzo pubblico, app sugli store.

Le persone senza account, che erano la decisione aperta di ieri, ci sono da
[`07-persone-senza-account.sql`](supabase/07-persone-senza-account.sql): una
persona sta in squadra e va in turno anche senza una email vera, e l'accesso
glielo si dà dopo, se serve.

E un pezzo che manca a quello che c'è: un rifiuto lo si scopre aprendo i
Turni. Finché non arrivano le notifiche vere — email o push — un responsabile
che non apre l'app non sa che qualcuno ha detto di no.

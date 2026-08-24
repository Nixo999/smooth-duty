# Turni

Pianificazione turni per squadre e aziende. Il responsabile costruisce la
settimana, ogni dipendente vede la sua.

## Avvio in locale

### 1. Il database

Serve un progetto Supabase (gratuito).

1. Vai su [supabase.com](https://supabase.com) → **New project**.
2. A progetto creato, apri **SQL Editor** → **New query** ed esegui in ordine
   [`01-schema.sql`](supabase/01-schema.sql),
   [`02-amministratori.sql`](supabase/02-amministratori.sql) e
   [`03-vincoli.sql`](supabase/03-vincoli.sql).
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

## Le decisioni che contano

**L'isolamento fra aziende è nel database, non nel codice.** Ogni tabella ha
RLS attivo e le policy confrontano `company_id` con quello di chi sta
chiedendo. Anche se una pagina sbagliasse una query, i dati di un'altra
azienda non uscirebbero. Le policy leggono azienda e ruolo tramite funzioni
`SECURITY DEFINER` (`current_company_id()`, `is_capo()`): una policy che
interroga direttamente una tabella a sua volta protetta manda Postgres in
ricorsione infinita (errore 42P17).

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

**I colori stanno solo in `globals.css`.** I componenti usano i token
(`bg-surface`, `text-muted`, `bg-accent`), mai un colore scritto a mano: è
l'unico modo perché chiaro e scuro restino coerenti mentre l'app cresce.

## Struttura

```
src/
  app/
    (auth)/          accesso e cambio password obbligatorio
    (admin)/         amministrazione: elenco e creazione aziende
    (app)/turni/     tabellone del responsabile · settimana del dipendente
    (app)/squadra/   gestione delle persone
  components/
    ui/              bottone, campi, finestra, tema
    turni/           tabellone, finestra turno, importazione
    squadra/  admin/
  lib/
    supabase/        client browser · server · service_role
    auth.ts          chi sta usando l'app, con guardie per le pagine
    date.ts          settimane, durate, turni a cavallo della mezzanotte
    import/          lettura del foglio, riconoscimento, abbinamento nomi
supabase/*.sql       tabelle e regole di accesso, in ordine numerico
android/             guscio Capacitor per l'APK di prova
scripts/             generazione icone e prova del lettore su un file finto
```

## Non c'è ancora

Lettura dei turni da una foto, notifiche via email e push, generazione
automatica dei turni, pubblicazione su un indirizzo pubblico, app sugli store.

E una decisione aperta: oggi ogni persona in turno deve avere un account con
una email vera. Su un tabellone da trenta persone è un peso, e limita
l'importazione — si importano solo i turni di chi è già in squadra. L'alternativa
è permettere persone senza account, attivabili più avanti.

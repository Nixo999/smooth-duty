# Avviare, provare, pubblicare

Il [README](../README.md) spiega come si installa da zero. Qui c'è quello che
serve a **lavorarci**, e le cose che valgono solo su questa macchina.

## Dove sta tutto

| Cosa | Dove |
|---|---|
| Cartella di lavoro | cambia da macchina a macchina, vedi sotto |
| Repository | `https://github.com/Nixo999/smooth-duty.git`, ramo `main` |
| Database di sviluppo | progetto Supabase `rytuurzafjxzlrpgforj` (regione Irlanda) |
| Chiavi | `.env.local` (fuori da git) |
| Password del database, per gli script | `.env.db` (fuori da git) |

## Si lavora da più macchine

Il repository è lo stesso, la cartella no. Nessun documento qui dentro deve
dare per scontato un percorso: se un comando ha bisogno di sapere dove sta il
progetto, lo si scrive relativo alla radice.

| Macchina | Cartella | Note |
|---|---|---|
| Windows | `C:\Users\User\Desktop\turni` | JDK 21 in `android/gradle.properties` |
| macOS | `~/Desktop/smoothduty` | il JDK si mette in `~/.gradle/gradle.properties` |

Le cose che valgono **solo su una macchina** non si scrivono nei file condivisi:
`.env.local`, `.env.db` e il percorso del JDK stanno fuori da git, o vengono
sovrascritti per macchina. Il caso già capitato è
`org.gradle.java.home` in `android/gradle.properties`: quel percorso è di
Windows, e su macOS Gradle si ferma subito. Non va tolto — servirebbe a
rimettere in piedi la build dell'altra macchina — si sovrascrive dove Gradle
guarda per primo, cioè `~/.gradle/gradle.properties`:

```
org.gradle.java.home=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
```

### Lavorare in parallelo, senza pestarsi i piedi

Più agenti sullo stesso ramo `main`. Non c'è un rituale complicato, ce n'è uno
solo, e va fatto ogni volta:

1. **`git pull` prima di cominciare**, e di nuovo prima di ogni push. Chi
   comincia da un albero vecchio scrive contro un'app che non esiste più.
2. **Dopo il pull, `verifica-schema.mjs`** (qui sotto): il codice appena
   arrivato può chiedere colonne che il *tuo* database non ha ancora, e
   l'effetto non somiglia a un errore — somiglia a un tabellone vuoto.
3. **Commit piccoli e push subito.** Il lavoro tenuto in locale mezza giornata
   è il lavoro che poi non entra: la finestra in cui due persone toccano lo
   stesso file va tenuta corta.
4. **Prima di toccare un file, `git log -1 <file>`.** Se l'ha appena cambiato
   un altro, si legge cosa ha fatto prima di rifarlo diverso.
5. **Il diario dice chi ha fatto cosa, quando.** Dopo un pull con commit nuovi
   che non sono tuoi, [07-diario.md](07-diario.md) è il primo file da leggere:
   è lì che sta il *perché*, che il `git diff` non racconta.
6. **Il push non passa? Non forzare.** Si fa `git pull --rebase` e si guarda il
   risultato: `main` è condiviso, e un `--force` cancella il lavoro di
   qualcun altro senza chiedere.

## Il server di sviluppo

```bash
npm run dev
```

C'è già `.claude/launch.json` con la configurazione `turni` sulla porta 3000:
il pannello browser la avvia da solo. **Non avviare mai il server da Bash.**

Altri comandi:

| Comando | Cosa fa |
|---|---|
| `npm run build` | build di produzione — *passa ≠ funziona* |
| `npm run start:rete` | serve la build su `0.0.0.0:3000`, per provare dal telefono |
| `npm run lint` | eslint |
| `npm run prove` | i controlli sui motori puri (vedi sotto) |
| `npm run icone` | rigenera le icone PWA e Android |
| `npm run apk` | compila l'APK di debug |

## Dopo ogni `git pull`: verifica lo schema

```bash
node --env-file=.env.local --env-file=.env.db scripts/verifica-schema.mjs
```

**È il primo comando da lanciare quando si aggiorna il codice**, e non è una
precauzione teorica: il 25 agosto 2026 il codice chiedeva colonne che nel
database non c'erano ancora, Postgres rifiutava l'intera interrogazione e
l'app mostrava un tabellone vuoto al posto di 429 turni.

Lo script controlla le 15 migrazioni una per una e, se qualcosa manca, dice
**quale file** e stampa il comando per eseguirlo. Distingue una migrazione mai
eseguita da una passata a metà, che è il caso peggiore.

Le migrazioni si possono eseguire da qui, senza passare dal SQL Editor:

```bash
node --env-file=.env.local --env-file=.env.db scripts/esegui-sql.mjs supabase/14-preapprovazione-e-rifiuti.sql
```

Sono ri-eseguibili (`if not exists`, `drop ... if exists`) e **nessuna cancella
turni**: nel dubbio si rilanciano in ordine.

⚠️ Aggiungendo una migrazione va aggiunto il suo gruppo di controlli in
`verifica-schema.mjs`. Senza, lo script torna a rispondere «tutto a posto»
mentre manca l'ultima — che è esattamente come è andata.

## Le prove

**Non c'è un framework di test.** Ci sono script che fanno girare i motori puri
e stampano il risultato, e sono l'unica cosa che si può eseguire senza browser:

```bash
npm run prove
```

Fa girare, in fila: `prova-copia` (corrispondenza dei giorni nella copia),
`prova-copertura` (motore della Supervisione), `prova-prospetto` (i conti delle
ore), `prova-trascina` (la matematica delle barre trascinate), `prova-lettura`
(il lettore Excel sul foglio di esempio — la riga che conta è quella dei
totali).

Tutto il resto **si verifica nel browser**. «Compila» non è una verifica.

## Gli script, uno per uso

In `scripts/`, tutti Node puro. Quelli che toccano il database vogliono
`--env-file=.env.local` (chiavi Supabase) o `.env.db` (Postgres diretto);
quelli che importano dai sorgenti vogliono `--import ./scripts/alias.mjs`, che
insegna a Node l'alias `@/` che altrimenti conosce solo TypeScript.

| Script | A cosa serve |
|---|---|
| `verifica-schema.mjs` | **da lanciare dopo ogni `git pull`**: controlla lo schema migrazione per migrazione e stampa quali file eseguire |
| `verifica-riservatezza.mjs` | controlla che il motivo di un'assenza lo vedano solo capo e interessato. Assume l'identità dei ruoli via Postgres, senza password |
| `esegui-sql.mjs` | esegue un file `.sql` sul database (l'API REST di Supabase non sa creare tabelle) |
| `dati-di-prova.mjs` | riempie un'azienda con reparti, squadra, fasce e due settimane di turni |
| `carica-mediaworld.mjs` | crea un'azienda e ci carica dentro un foglio orari reale |
| `crea-esempio.mjs` | ricostruisce un foglio con la struttura del tabellone vero |
| `copertura-oggi.mjs` | stampa cosa mostrerà la Supervisione per un giorno, sui dati veri |
| `prospetto-reale.mjs` | stampa la tabella del Prospetto sui dati veri |
| `apk.mjs` | lancia il wrapper di Gradle col nome che ha su questa macchina (`gradlew.bat` o `./gradlew`) |
| `crea-icone.mjs` · `icone-android.mjs` | icone PWA e icone adattive Android |

Le password degli account di prova arrivano **da fuori**, mai dal codice:

```bash
TURNI_DEMO_PASSWORD=... node --env-file=.env.local scripts/dati-di-prova.mjs
```

## Provare dal telefono

**Sulla stessa rete Wi-Fi**: `npm run build && npm run start:rete`, poi dal
telefono `http://<ip-del-computer>:3000`.

⚠️ Su un indirizzo `http` di rete locale il browser **non** propone
l'installazione: i service worker girano solo su HTTPS o su localhost. È una
regola dei browser, non un difetto dell'app.

**Come APK**: `TURNI_URL=http://192.168.1.x:3000 npm run apk`. L'app ha codice
che gira sul server, quindi non si impacchetta in file statici: l'APK è una
finestra nativa che apre l'app dove sta girando davvero. Il file esce in
`android/app/build/outputs/apk/debug/app-debug.apk`.

Servono JDK 21 e l'SDK Android. Il JDK **non** si prende da `JAVA_HOME`: sulla
macchina Windows quella variabile punta al JDK 19 perché serve ad altri
progetti, quindi il percorso è scritto in `android/gradle.properties`. È un
percorso di Windows in un file condiviso: le altre macchine lo sovrascrivono in
`~/.gradle/gradle.properties`, che Gradle legge per primo. Vedi «Si lavora da
più macchine».

## PWA

Manifest, icone e service worker sono a posto (`public/manifest.webmanifest`,
`public/sw.js`, `public/offline.html`). Il service worker è **volutamente
prudente**: mette in cache solo i file statici, mai le pagine. Un tabellone
salvato in cache ricomparirebbe al collega che usa lo stesso telefono,
mostrando turni vecchi come se fossero quelli veri.

## Pubblicare

Su Netlify o Vercel il progetto si riconosce da solo, ma **le variabili
d'ambiente vanno impostate a mano** (`.env.local` non sta in git). Si leggono
in fase di build: dopo averle aggiunte serve un **nuovo deploy**, non basta
ricaricare.

⚠️ Due cose da non dimenticare, entrambe già costate:
1. **La regione delle funzioni**: Netlify le mette in Ohio, il database sta in
   Irlanda. `Project configuration → Build & deploy → Functions → Region` →
   `eu-west-1`, poi nuovo deploy.
2. **Cambiare la password dell'amministratore** prima di lasciare il sito
   raggiungibile. Su localhost una password debole è un fastidio teorico; su
   internet è la porta d'ingresso a tutte le aziende, e alle causali di
   malattia e legge 104 che il resto dell'app protegge con cura.

## Il primo amministratore

Non esiste una pagina pubblica per registrarsi: sarebbe una porta aperta. Si
crea a mano, una volta sola — Supabase → *Authentication › Users › Add user*
con *Auto Confirm*, poi nel SQL Editor:

```sql
insert into public.platform_admins (user_id, email)
select id, email from auth.users where email = 'tua@email.it'
on conflict (user_id) do nothing;
```

Da lì in poi tutto passa dall'interfaccia: l'amministratore crea le aziende col
loro responsabile, il responsabile aggiunge i dipendenti.

## Git

Su questo progetto si **committa e si pusha dopo ogni pezzo finito**, senza
chiedere. Il messaggio dice cosa non tornava e perché la soluzione è quella,
non l'elenco dei file toccati — guarda `git log` per il tono.

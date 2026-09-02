# Le pagine, una per una

Per ciascuna: cosa fa, i file da aprire, cosa legge, chi la vede. È il
documento da consultare prima di toccare una schermata.

Struttura ricorrente: `page.tsx` legge (Server Component), `actions.ts` scrive
(Server Action), il componente in `src/components/` disegna (`"use client"`).

---

## `/login` e `/cambia-password`

**File**: `src/app/(auth)/` — `login/page.tsx`, `cambia-password/page.tsx`,
`actions.ts`; componenti in `src/components/auth/`.

Solo email e password: **l'azienda si ricava dall'account**, così chi entra non
deve ricordare codici. L'errore è volutamente generico («Email o password non
corretti»): dire «questa email non esiste» permetterebbe a chiunque di scoprire
chi ha un account.

Dopo l'accesso si va **direttamente** alla destinazione (`destinazioneDi()` in
`src/lib/auth.ts`), senza rimbalzare su `/`: quel rimbalzo era un giro di rete
intero, e sull'ingresso si sente tutto.

**Password dimenticata** (`/password-dimenticata` → `chiediRecuperoPassword`):
si scrive l'indirizzo e parte un link. La risposta è **sempre la stessa**, che
l'account esista o no — dire «questo indirizzo non risulta» regalerebbe a
chiunque l'elenco di chi lavora qui, provando indirizzi finché uno non risponde
diverso. È la stessa regola dell'errore generico sull'accesso.

**`/conferma`** è un **Route Handler**, non una pagina, e non è un dettaglio di
gusto: lì va *scritto* un cookie di sessione, e un Server Component i cookie non
li può scrivere. È l'unico punto dell'app in cui un codice arrivato per posta
diventa una sessione — un posto solo da guardare quando si ragiona su come si
entra. Accetta due forme (`token_hash` da verificare qui, oppure `code` PKCE) e
poi alza `must_change_password` sul profilo, così chi entra dal link finisce
sulla stessa pagina — e sotto lo stesso controllo — di chi ha una password
provvisoria. Nessuna scorciatoia nuova da sorvegliare.

Tre cambi password diversi, da non confondere:
- `cambiaPassword` — quello **obbligatorio** al primo accesso; finisce con
  `mark_password_changed()`;
- `cambiaLaMiaPassword` — quello **volontario**, dal menu dell'account in ogni
  pagina (`components/auth/cambia-la-mia-password.tsx`). Richiede la password
  attuale e la verifica **rifacendo l'accesso**: Supabase da solo non la
  controlla, e senza quel passaggio chi trovasse aperta l'app di un collega
  potrebbe prendersi l'account in tre secondi;
- `reimpostaPassword` (in Squadra e in Admin) — il responsabile ne assegna una
  provvisoria a qualcun altro, e rialza `must_change_password`.

L'accesso ha un **limite di tentativi** (`src/lib/limite-tentativi.ts`): dieci
errori per indirizzo in un quarto d'ora, cinquanta per provenienza di rete.
Contano solo i tentativi andati male, ed entrare azzera il conto. Le regole e
il perché dei due limiti stanno in [05-convenzioni.md](05-convenzioni.md).

---


## `/turni` — il tabellone

**File**: `src/app/(app)/turni/page.tsx` · `actions.ts` ·
`src/components/turni/roster.tsx` (capo, 1100 righe) ·
`src/components/turni/my-week.tsx` (dipendente).

Una pagina, **due schermate diverse** secondo il ruolo.

**Capo → `Roster`**: griglia persone × giorni. Da telefono diventa un giorno
alla volta (`DayList`). Ha filtro per reparto, ricerca per nome, riga
«scoperti» per i turni senza persona, ore settimanali confrontate col
contratto (arancio = oltre, rosso = sotto: sono i due numeri che il
responsabile cerca), annulla/ripeti, copia turni, importazione, pubblicazione.

**Dipendente → `MyWeek`**: la settimana per giorni, senza griglia. Deve
rispondere a una domanda sola — quando lavoro — anche da telefono. Mostra
l'assenza in corso col motivo e la conferma del rientro. Sul turno
preapprovato dice **che cosa ha di particolare**, ma non chiede più niente lì:
per rispondere si va nella posta, in cima.

**La posta** (`components/turni/posta.tsx`) è il riquadro a comparsa in cima
alla schermata del dipendente: la settimana in straordinario da accettare o
rifiutare intera, i turni su cui dire la propria, gli avvisi da leggere. I due
bottoni stavano dentro il giorno fino al 26 agosto 2026, e sembrava logico:
ma **una cosa da decidere che sta dentro un giorno si vede solo se si guarda
quel giorno**, e chi apre l'app il lunedì non scorre fino a sabato. Si può
chiudere — si accartoccia in una pastiglia che dice quante cose restano — ma
non sparisce chiudendola: sparisce dopo una decisione, o dopo «ho letto».

In cima al tabellone del responsabile c'è la casella dei **messaggi**
(`components/turni/messaggi.tsx`): i no dei dipendenti, e cosa ne è seguito.
Aprirli è ciò che fa scattare l'effetto del rifiuto — vedi
[04-regole.md](04-regole.md).

Sulle caselle di chi è a chiamata il tabellone disegna quello che la persona
ha dichiarato — «non c'è», «disponibile», o le ore — e sotto la lista bianca
segna in grigio i giorni **senza** dichiarazione, dove il salvataggio dirà di
no. Serve prima del clic, non dopo: costruire una settimana a tentativi —
scrivi, salva, leggi il rifiuto, riprova — è esattamente il lavoro che questa
app dovrebbe togliere. Da telefono la stessa pastiglia sta accanto al nome, e
chi ha dichiarato qualcosa compare nell'elenco del giorno anche senza turni.

### Le due viste: Turni e Disponibilità

**File**: `src/components/turni/disponibilita-griglia.tsx` ·
`src/components/turni/striscia-giorni.tsx`.

Un interruttore accanto alla settimana passa dai turni alle **disponibilità**,
e resta la stessa griglia: stessi sette giorni, stessa navigazione, stessa
ricerca. Compare solo se l'azienda usa un calendario (`regime_chiamata` diverso
da `on_demand`) e c'è almeno una persona a chiamata fra quelle mostrate.

Due viste e **non due pagine**: la disponibilità e il turno sono la stessa
domanda guardata da due parti — «chi posso mettere sabato» — e in due schermate
diverse il responsabile dovrebbe ricordarsi il tabellone mentre guarda il
calendario. Per la stessa ragione nella vista dei turni le disponibilità
restano visibili in ogni casella: leggerle non deve costare nemmeno un clic.

Il gesto è **tocca le caselle, poi dici cosa farne** — «non è disponibile» /
«è disponibile», «solo alcune ore», «togli». La selezione attraversa le
persone, non solo i giorni: il ponte in cui non c'è nessuno dei tre si segna in
una passata sola, cosa che un calendario per persona non saprebbe fare.

Nella vista delle disponibilità spariscono i filtri e i comandi che cambiano i
turni — annulla, pubblica, svuota, nuovi turni: sarebbero bottoni che agiscono
su quello che non si sta guardando.

Legge: `profiles` (attivi) · `shifts` della settimana · `departments` ·
`absences` che toccano la settimana · `reparto_piu_frequente` ·
`published_weeks` per quel lunedì. **Al dipendente i turni di una settimana in
bozza non arrivano proprio** (`shifts={inBozza ? [] : shifts}`): una settimana a
metà fa più danni di una dichiaratamente non pronta.

Legge anche i **messaggi aperti**, e non filtrati per settimana: un turno
rifiutato di sabato non deve sparire perché il responsabile sta guardando
lunedì. Stessa cosa per gli **avvisi** del dipendente (`shift_notices`, solo i
non letti) e per le **risposte sulla settimana** (`week_requests`): al
dipendente quella della settimana che sta guardando, se è ancora aperta; al
responsabile quelle decise e non ancora lette, di qualunque settimana.

Se la lettura dei turni o delle persone **fallisce**, la pagina mostra
`ErroreDati` invece di un tabellone vuoto: vedi
[05-convenzioni.md](05-convenzioni.md).

`pubblicaSettimana` **può fermarsi a chiedere**: se qualcuno sta sotto le sue
ore da contratto restituisce l'elenco invece di pubblicare, il tabellone lo
mostra coi nomi e le ore mancanti, e si riparte con `pubblicaSettimana(monday,
true)`. Vedi [04-regole.md](04-regole.md).

Azioni: `salvaTurno` · `eliminaTurno` · `eliminaTuttiITurni` ·
`ripristinaTurni` · `copiaTurni` · `anteprimaCopia` · `pubblicaSettimana` ·
`accettaTurno` · `rifiutaTurno` · `apriMessaggi` · `chiudiMessaggio` ·
`segnaAvvisoLetto` · `accettaSettimana` · `rifiutaSettimana` ·
`chiudiRichiestaSettimana`.

---

## `/turni/importa` — leggere un foglio

**File**: `src/app/(app)/turni/importa/` · `src/components/turni/importa.tsx` ·
`src/lib/import/` (`grid.ts` legge il file, `parse.ts` lo interpreta,
`match.ts` abbina i nomi).

Solo capo. Excel `.xlsx` o CSV, massimo 5 MB; `.xls` viene rifiutato con
l'istruzione per convertirlo. Mostra cosa ha capito e salva **solo dopo
conferma**. Dettaglio del funzionamento in [04-regole.md](04-regole.md).

Gli abbinamenti nome → persona li decide il browser, quindi il server li
**ricontrolla**: verifica che ogni identificativo sia di questa azienda. Le
insert vanno a blocchi da 500, perché una singola insert da migliaia di righe
supera i limiti della richiesta e fallisce senza dire perché.

---

## `/supervisione` — la giornata

> Dal 30 agosto 2026 **gli assenti non compaiono**: il loro turno non conta
> nella copertura — che è la domanda di questa pagina — e la barra sbiadita
> che lo mostrava senza contarlo confondeva più di quanto informasse. Chi è
> assente e perché resta scritto nei Permessi.

**File**: `src/app/(app)/supervisione/page.tsx` · `actions.ts` ·
`src/components/supervisione/supervisione.tsx` ·
`src/components/supervisione/reparti-sheet.tsx` ·
**motore**: `src/lib/supervisione/copertura.ts`.

Un giorno alla volta, ora per ora: chi c'è, in quali fasce, e **cosa è
scoperto**. La vedono anche i dipendenti se l'azienda lo concede
(`supervisione_dipendenti`) — la pagina ricontrolla l'impostazione perché il
menu la nasconde ma l'indirizzo diretto no.

**Legge due giorni, non uno**: un turno 18:00–02:00 di ieri copre le prime ore
di oggi, e senza guardare indietro la notte sembrerebbe scoperta.

Le assenze arrivano dalla vista `absence_days`, **non** dalla tabella: qui il
motivo di un'assenza altrui non riguarda i colleghi.

Da qui il responsabile **modifica i turni** (stesso `ShiftDialog` dei Turni,
stesso `turni-staging.ts`): si aggiusta il turno dove lo si vede storto. Le
barre si possono anche **trascinare** — per i bordi si cambia l'orario, per il
centro si sposta il turno intero — col motore in
`src/lib/supervisione/trascina.ts`. I turni rifiutati si vedono anche qui. Il
pannello `RepartiSheet` gestisce reparti e fasce di copertura.

Si spegne con `pagina_supervisione`; ai soli dipendenti con
`supervisione_dipendenti`. In entrambi i casi la pagina **ricontrolla** e
rimanda ai Turni: il menu nasconde la voce, non l'indirizzo.

---

## `/permessi` — chiedere e decidere

**File**: `src/app/(app)/permessi/page.tsx` · `actions.ts` ·
`src/app/(app)/assenze-actions.ts` ·
`src/components/permessi/permessi.tsx` (992 righe).

Calendario mensile. **Il dipendente chiede** qualunque causale fra quelle
ammesse dall'azienda (`causali_richiedibili`); **il responsabile decide**, e
può anche registrare a mano un'assenza già avvenuta (malattia di stamattina).

Chi vede cosa **lo decide il database**, non questa pagina: al dipendente
arrivano le sue righe più le ferie degli altri, al responsabile tutto. Qui non
c'è un filtro da dimenticare.

Azioni: `chiediPermesso` · `ritiraRichiesta` (solo finché è `richiesta`: le
decise sono storia) · `decidiRichiesta` · `apriAssenza` · `chiudiAssenza` ·
`eliminaAssenza` · `confermaRientro`.

`/ferie` è un redirect qui: la pagina si chiamava così finché si chiedevano
solo le ferie. Si spegne con `pagina_permessi`.

---

## `/disponibilita` — il calendario del dipendente a chiamata

> Dal 30 agosto 2026 la pagina **si può spegnere dalle Impostazioni**
> (`pagina_disponibilita`, migrazione `20`), come Permessi e Supervisione:
> spenta, sparisce dal menu e si rifiuta di aprirsi. Le dichiarazioni
> restano, e il responsabile continua a gestirle dalla vista Disponibilità
> del tabellone — che **non** dipende da questa levetta.

**File**: `src/app/(app)/disponibilita/page.tsx` · `actions.ts` ·
`src/components/disponibilita/disponibilita.tsx` ·
**motore**: `src/lib/disponibilita.ts`.

Calendario mensile (`?m=YYYY-MM`, come i Permessi). **È del dipendente, e
solo suo.** Il responsabile qui non entra — viene rimandato ai Turni, dove le
stesse dichiarazioni le vede accanto ai turni su cui deve decidere. E riguarda
solo chi è a chiamata: chi ha un monte ore ha già il suo contratto, e questo
calendario gli farebbe dubitare di averlo.

Che cosa significhi una casella segnata lo decide `regime_chiamata`, e la
schermata lo scrive in chiaro invece di lasciarlo indovinare — è l'unico posto
in cui l'ambiguità costerebbe una persona mandata a lavorare in un giorno in
cui aveva detto di non esserci.

**Il gesto è: tocca i giorni, poi dici cosa farne.** Il tocco seleziona, non
scrive; una barra in fondo offre «tutto il giorno», «solo alcune ore» e
«togli». Così un weekend intero o un mese si segnano in un gesto solo, e le
fasce orarie restano visibili invece di nascondersi dietro un tocco lungo che
nessuno scoprirebbe.

Un puntino accanto al numero del giorno dice che lì c'è già un turno: la
disponibilità si dichiara guardando dove si è impegnati, non a memoria.

La pagina **non esiste** in tre casi, e sono tre ragioni diverse: al
responsabile (ce l'ha nei Turni), sotto il regime `on_demand` (non c'è niente
da segnare) e a chi ha un contratto a ore (non ha un calendario da riempire).
Come per le pagine spegnibili sono due posti da tenere d'accordo —
`src/app/(app)/layout.tsx` e la guardia dentro la pagina — perché l'indirizzo
se lo ricorda il browser.

⚠️ **La telefonata resta.** «Sabato non posso» il dipendente lo dice al
telefono più spesso di quanto apra l'app: per questo il responsabile deve
poterlo scrivere lui, e lo fa dal tabellone. Senza quella strada quella
dichiarazione non verrebbe scritta mai.

Azioni: `segnaDisponibilita` · `togliDisponibilita` — le stesse che chiama il
tabellone del responsabile, e il verso lo decidono loro leggendo il regime, non
chi le chiama. Si cancella **per giorno** e non per riga: chi ripensa a un giovedì lo pensa intero, e fargli
togliere una fascia per volta sarebbe fargli rifare a mano un conto che ha già
in testa.

---

## `/prospetto` — i conti

**File**: `src/app/(app)/prospetto/page.tsx` ·
`src/components/prospetto/prospetto.tsx` · **motore**: `src/lib/prospetto.ts`.

Solo capo. Una tabella per settimana, mese o anno: ore programmate, perse,
saltate, effettive e attese, più **una colonna per ogni causale di assenza**
comparsa nel periodo (`malattia` c'è sempre, anche a zero: una colonna che
sparisce a seconda del mese rende impossibile confrontare due periodi).

Legge le assenze dalla **tabella** e non dalla vista: insieme a Squadra è
l'unico posto in cui la causale serve, e lo vede solo il responsabile.

Il calcolo di «quanto è costata un'assenza» è la regola meno ovvia dell'app:
sta in [04-regole.md](04-regole.md). Si spegne con `pagina_prospetto`.

---

## `/squadra` — le persone

**File**: `src/app/(app)/squadra/page.tsx` · `actions.ts` ·
`src/components/squadra/` (`squadra.tsx`, `aggiungi-persone.tsx`,
`campi-rapporto.tsx`).

Solo capo. Crea persone (una alla volta o **incollando un elenco di nomi**),
dà o toglie l'accesso, assegna ruolo, reparti, tipo di contratto e ore,
sospende, reimposta password, rimuove.

**Sospendere e riattivare si fa dalla riga** (`commutaAttiva`), non dentro la
scheda: è il gesto più frequente qui — chi va via per un periodo, chi torna —
e stava in fondo a un elenco di campi. Sospeso vuol dire che la persona resta
in squadra e la sua storia resta nei conti, ma sparisce dai turni; non è la
rimozione, che cancella anche l'account.

Due protezioni scritte in `modificaPersona`:
- non ci si toglie il ruolo se si è **l'unico responsabile attivo** — il
  vincolo vero non è «non toccare te stesso», è che l'azienda non resti senza
  nessuno che possa gestirla;
- non si promuove a responsabile chi **non ha un accesso**: sarebbe un capo che
  non può entrare.

`rimuoviPersona` cancella anche l'account in `auth.users`, che il `delete` su
`profiles` non tocca: altrimenti resterebbe un login orfano.

---

## `/impostazioni` — gli interruttori dell'azienda

**File**: `src/app/(app)/impostazioni/` · `src/components/impostazioni/`.

Solo capo. Dodici impostazioni, tutte descritte in
[04-regole.md](04-regole.md): quali moduli l'azienda usa, chi vede la
Supervisione, quali motivi di assenza si possono chiedere, quando la squadra
viene coinvolta sui turni, e come si ingaggia chi lavora a chiamata.

La dodicesima non è una levetta ed è l'unica scelta fra tre: le regole di
ingaggio non sono un'opzione da accendere, sono tre accordi diversi fra datore
e lavoratore, e il secondo non è «il primo di più». Tre levette in fila
lascerebbero accenderne due, che non vuol dire niente.

**Quattro sezioni per ambito, su due colonne da 1024 px** (2 settembre 2026).
A sinistra l'app e la settimana — *Moduli attivi*, *Pubblicazione e modifiche*;
a destra le persone — *Cosa vedono e cosa chiedono i dipendenti*, *Turni nuovi
e lavoro a chiamata*. Fino al 1 settembre erano sei gruppi «per gesto», tutti
intitolati «Quando…»: su una colonna erano un indice inutile, su due sarebbero
state sei volte la stessa parola nella stessa schermata. Il gesto è sceso di un
livello e sta nella riga «Quando scatta».

⚠️ **Quell'ordine è quello che pareggia le colonne, non ci si arriva per
logica.** Il primo taglio metteva a sinistra «cosa esiste» e a destra «cosa
succede quando muovi un turno»: si racconta meglio e lascia la colonna destra
**450 px più lunga**, perché le due sezioni più alte finiscono una sopra
l'altra. Chi sposta una sezione rimisuri, o il difetto torna.

Il layout: `lg:max-w-6xl` (colonne da ~552 px, descrizioni sui 72 caratteri),
due wrapper di colonna e non figli diretti dentro `grid-cols-2` — così
l'ordine del DOM resta quello di lettura sul telefono e aprire un `<details>`
allunga solo la sua colonna — più `items-start`, o le due colonne si stirano
alla stessa altezza. Sotto i 1024 px la pagina è identica a prima.
La testata con lo stato del salvataggio è **fissa a ogni larghezza**
(`sticky top-0`) e **non cambia mentre si scorre**: titolo, nome dell'azienda
e riga di spiegazione restano identici dal primo pixel all'ultimo. Una
versione intermedia si accorciava da staccata; è stata tolta perché per chi
guarda è un'altra cosa che si muove. Il costo è dichiarato: sul telefono sono
~74 px di barra sempre presenti, sotto ai 56 della topbar. ⚠️ **`top-0` e non `top-14`**: a scorrere non è la
finestra ma il `<main>` del guscio (`overflow-y-auto`), quindi lo `sticky` si
misura dal bordo alto dell'area di contenuto, che sta già sotto la topbar —
con `top-14` la testata si incollava 56 px troppo in basso. Il fondo è la classe `glass`, la stessa della topbar, ed è **sempre acceso**:
dietro c'è lo sfondo d'ambiente del guscio — un `bg-canvas` piatto ci si
vedrebbe sopra come una toppa — e accenderlo solo da staccata sarebbe di nuovo
qualcosa che cambia sotto gli occhi.

Fra le levette c'è un riquadro «sempre attivo», che levetta non è: la settimana
in cui qualcuno sta sotto le sue ore da contratto si pubblica solo dopo che
l'app te l'ha fatto vedere. Sta lì perché è lì che uno la cerca.

Le descrizioni sono scritte per chi **decide**, non per chi impara: l'etichetta
è un sostantivo («Accettazione dei turni in straordinario»), la descrizione sta
in una o due righe e dice cosa cambia in azienda, la rassicurazione è un fatto
(«il turno resta valido») e non una pacca sulla spalla. Ogni levetta porta, in
un richiudibile, **quando** scatta e **cosa succede se la persona dice di no**:
sono le due domande che uno si fa davanti a un interruttore. Per i tre regimi a
chiamata la seconda riga si chiama «Esito» e non «In caso di rifiuto», perché
lì l'app blocca il salvataggio invece di far rifiutare.

Un salvataggio fallito lascia scritto «Modifica non salvata» finché non ne
riesce uno nuovo: il toast passa, e su due colonne la levetta che è tornata
indietro da sola può stare nella metà di schermo che non si sta guardando.

Salvando si rivalidano anche `/supervisione`, `/permessi` e `/turni`: queste
impostazioni cambiano cosa vedono gli altri.

---

## `/admin` — le aziende

**File**: `src/app/(admin)/admin/page.tsx` · `actions.ts` ·
`src/components/admin/aziende.tsx` (620 righe).

Solo `platform_admins`. Crea un'azienda — con o senza il suo primo
responsabile, con o senza una squadra incollata da un elenco — la rinomina, la
elimina con tutto quello che contiene, crea account dentro un'azienda,
reimposta password.

La creazione fa **rollback a mano** su ogni errore (cancella l'utente auth e
l'azienda appena creati): niente account orfani. Unica eccezione voluta: se
fallisce solo l'elenco dei nomi, l'azienda resta in piedi — l'elenco si
ricarica, buttare via il responsabile appena creato per un nome scritto male
sarebbe peggio del problema.

Usa `createAdminClient()` (`service_role`, scavalca RLS). Quel client è
importabile **solo** dal server: `import "server-only"` fa fallire la build se
finisce nel bundle del browser.

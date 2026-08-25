# Le regole che non si deducono dal codice

Qui stanno le decisioni di dominio: quelle che leggendo una funzione si capisce
*cosa* fa ma non *perché* deve farlo così. Sono il pezzo che un'analisi da capo
non ricostruisce.

---

## Bozza e pubblicazione

**Ogni settimana nasce bozza. I dipendenti non la vedono finché il responsabile
non preme Pubblica.**

Il verso conta ed è stato rovesciato di proposito (migrazione `12`): la tabella
si chiama `published_weeks` e contiene le **pubblicate**. Una tabella di
*bozze* presupporrebbe che qualcuno si ricordi di marcarle, e una settimana
dimenticata finirebbe in faccia ai dipendenti a metà.

Conseguenze sparse per il codice:
- `inBozza = !published_weeks[monday]` — lo calcola `turni/page.tsx`;
- al dipendente i turni di una settimana in bozza **non vengono nemmeno
  inviati**, né nei Turni né nella Supervisione;
- **una settimana svuotata torna bozza da sola** (`riportaInBozzaSeVuota` in
  `turni/actions.ts`): una settimana senza turni non è «pubblicata e vuota», è
  da rifare. Vale anche spostando un turno da una settimana all'altra, che può
  lasciare vuota quella di partenza;
- prima della pubblicazione il tabellone è un foglio di lavoro: correggerlo non
  chiede niente a nessuno.

## Le modifiche in sospeso

Una settimana **già pubblicata** non si tocca alla leggera. Si preme
**Modifica**, si lavora su una copia locale — i dipendenti continuano a vedere
la versione pubblicata — e solo **Conferma** spedisce tutto al server.

Il motore è `src/lib/turni-staging.ts`, condiviso fra Turni e Supervisione:
due implementazioni divergerebbero al primo bug.

- `proietta(base, modifiche)` — il tabellone come *sarebbe*. Serve solo a
  disegnare: i campi che calcola il server (le conferme) restano vuoti.
- `compatta(modifiche)` — le operazioni ridotte all'osso. Dieci ritocchi allo
  stesso turno sono un salvataggio solo; un turno creato e poi cancellato non è
  mai esistito.
- I turni non ancora nati hanno id `nuovo:N`.

**E il blocco confermato resta disfabile.** Fino al 26 agosto 2026 le frecce si
spegnevano premendo Conferma: il lavoro appena mandato smetteva di poter
tornare indietro, e un ripensamento voleva dire rimettere a mano turno per
turno — proprio nel momento in cui si è meno lucidi, subito dopo aver premuto.

Il blocco intero diventa **una** voce di storia: la freccia indietro lo disfa
tutto, non un turno per volta. È lo stesso criterio dello svuotamento — chi ci
ripensa non deve premere trenta volte. La differenza con la bozza è che qui il
giro passa dal server: quelle modifiche i dipendenti le hanno già viste, quindi
disfarle è a sua volta un cambiamento pubblico, e il server ricalcola conferme
e avvisi su ciascuna. Disfacendo, **prima si tolgono i turni creati dal blocco**
e poi si rimettono quelli di prima: nell'ordine inverso la persona si
ritroverebbe il turno nuovo *e* quello vecchio.

**In bozza** invece si salva subito, ma ogni passo si sa disfare: la storia in
`roster.tsx` tiene per ogni voce l'operazione contraria, e l'id vivo sta in una
«scatola» condivisa perché *rifare* una creazione produce un id nuovo.

Una **mossa** (`Mossa = Operazione[]`) è un gesto dell'utente: quasi sempre
un'operazione sola, ma «Svuota» ne fa una per turno. La freccia indietro toglie
una mossa intera — chi svuota e ci ripensa non deve premere trenta volte.

### Svuotare, e tornare indietro

`eliminaTuttiITurni` restituisce i turni che ha cancellato, ed è **il server a
fotografarli mentre li toglie**: il tabellone che il browser ha in mano può
essere di dieci minuti fa, e rimettere in piedi quello cancellerebbe in
silenzio i turni aggiunti nel frattempo da un altro responsabile.

Oltre **2000 turni** lo svuotamento non promette il ritorno indietro: una
settimana così non si rimette con un solo insert, e promettere un annullamento
che poi fallisce è peggio che non prometterlo.

`ripristinaTurni` riporta anche la **facoltà di rifiuto** e la fotografia di
partenza — quella facoltà è del dipendente, e non deve dipendere da uno
svuotamento fatto per sbaglio dal responsabile. Non riporta invece i **no già
dati**, che parlavano di turni nel frattempo cancellati davvero. E non
ripubblica la settimana, per la stessa ragione per cui svuotarla la riporta in
bozza.

## Preapprovazione: il turno vale subito, e si può rifiutare

> ⚠️ **Il verso è stato rovesciato il 25 agosto 2026** (migrazioni `14` e
> `15`). Un documento che dica «il turno resta appeso finché l'interessato non
> conferma» descrive l'app di prima.
>
> ⚠️ E dal **26 agosto 2026** (migrazione `16`) non basta più chiedersi *se* un
> turno è cambiato: conta **in che verso**. Le ore che aumentano si chiedono,
> quelle che calano si avvisano. Vedi «Il verso della modifica» qui sotto.

**Prima**: il turno che generava straordinario, o che veniva cambiato dopo la
pubblicazione, restava appeso finché l'interessato non diceva di sì. Il
responsabile costruiva la settimana e poi aspettava; chi non apriva l'app per
due giorni teneva ferma la sua.

**Adesso**: quel turno è **preapprovato** — vale, si vede, si conta — e il
dipendente ha la *facoltà* di rifiutarlo. Chi tace ha accettato, che è il caso
di gran lunga più frequente.

Gli stati sono tre (`statoConferma()` in `src/lib/conferme.ts`, letto da tre
schermate: tabellone, elenco del telefono, settimana del dipendente):

| Stato | Vuol dire |
|---|---|
| `in_attesa` | il turno vale, l'interessato non si è ancora espresso |
| `accettato` | ha guardato e ha detto di sì (`accetta_turno`) |
| `rifiutato` | ha detto di no, e il responsabile ha un messaggio |

Il sì non rende valido il turno — lo è già — ma toglie il responsabile dal
dubbio: sabato sera «non si è ancora fatto vivo» e «ha guardato ed è d'accordo»
sono due situazioni molto diverse.

> **Le richieste di permesso non c'entrano.** Quelle nascono con riserva e
> restano tali finché il responsabile le approva: lì il verso è giusto così,
> perché un'assenza data per buona in attesa di smentita è un buco in turno che
> nessuno ha visto arrivare.

### Quando un turno è rifiutabile

Il calcolo sta in `salvaTurno` e dipende dalle impostazioni dell'azienda. In
ordine di precedenza:

| Caso | Condizione | Impostazione |
|---|---|---|
| `cambio_reparto` | è cambiato **solo** il reparto: stessa persona, stesso giorno, stessi orari | `conferma_cambio_reparto` (spento di suo) |
| `modifica_straordinario` | turno esistente, settimana **pubblicata**, e va oltre le ore da contratto | `conferma_modifiche_straordinari` |
| `modifica` | turno esistente, settimana pubblicata, senza straordinario | `conferma_modifiche` |
| `straordinario` | turno **nuovo** che porta oltre le ore da contratto | `conferma_straordinari` |
| `orario_diverso` | orario diverso da `preset_start`/`preset_end` della persona | `orari_preimpostati` |

Il cambio di reparto **decide da solo e chiude il discorso**: gli orari non si
sono mossi, quindi le regole sulle ore non hanno niente da dire. Spostare
qualcuno dalla cassa alla sala senza togliergli un minuto non è la modifica per
cui si disturba una persona.

Lo straordinario si misura sulla **settimana**: le ore degli altri turni,
senza quello che si sta salvando, più il turno nuovo.

**Ogni salvataggio ricalcola da capo e cancella il no precedente**: un no dato a
una versione non vale per quella dopo, che l'interessato non ha ancora visto.

### Il verso della modifica: si chiede, o si avvisa

**Togliere ore a qualcuno e aggiungergliene non sono la stessa domanda.**

Fino al 26 agosto una modifica a una settimana pubblicata era rifiutabile in
qualunque verso andasse. Ma chi si vede accorciare il turno non ha niente da
concedere: ha diritto di saperlo. Chiedergli un permesso che non può che dare
è un giro a vuoto — e non dirgli niente è peggio, perché il turno cambia e lui
lo scopre presentandosi.

Da qui tre esiti invece di due. La regola sta in una funzione pura,
`conseguenzaDelSalvataggio()` (`src/lib/conferme.ts`), perché la stessa
domanda la fanno il salvataggio, l'eliminazione e — un domani —
l'importazione:

| Esito | Quando | Cosa vede l'interessato |
|---|---|---|
| **rifiutabile** | le ore aumentano, **o il turno si sposta** | può dire di no; il turno torna com'era |
| **avviso** | le ore calano | «ho letto», e basta |
| **niente** | il resto, o interruttore spento | niente |

**Spostare un turno si chiede, non si comunica** (migrazione `17`). Nella `16`
lo spostamento era un avviso: stesse ore, quindi niente da concedere. Era un
ragionamento da contabile, non da persona. Il mattino e il pomeriggio non sono
la stessa giornata: chi porta i figli a scuola alle otto, chi ha un secondo
lavoro, chi ha preso un impegno — per tutti loro un turno che passa dalle
06–14 alle 14–22 cambia tutto, a ore identiche.

I casi che sembrano pignoleria e non lo sono:

- **meno ore restando comunque in straordinario è un avviso**, non una
  richiesta: conta che questo salvataggio *toglie* del lavoro, non dove la
  persona si trova rispetto alla soglia;
- **il turno che passa a un altro è due cose insieme**: per chi lo riceve è un
  turno nuovo — e le sue ore si guardano come quelle di una nuova assegnazione,
  non come una modifica del suo — per chi lo perde è un avviso `turno_rimosso`;
- **un turno cancellato avvisa**, ed è il caso in cui serve di più: sparisce
  dal tabellone, e con lui l'unica cosa che avrebbe potuto dirlo;
- **spegnere l'interruttore delle modifiche non spegne quello degli orari
  preimpostati**: sono due domande diverse, e la seconda ha il suo;
- **un interruttore solo governa tutte le modifiche**, straordinario compreso.
  Fino al 26 agosto 2026 gli straordinari ne avevano uno loro, **esclusivo**:
  chi accendeva quello generale non veniva avvisato proprio del caso più
  grosso — mandare qualcuno oltre il contratto passava in silenzio. Era il
  contrario di quello che uno si aspetta accendendo un interruttore. Il motivo
  però continua a distinguerli (`modifica` / `modifica_straordinario`):
  all'interessato non è indifferente sapere se quelle ore lo portano oltre;
- **svuotare la settimana non avvisa nessuno**: svuotandola torna bozza, e una
  settimana in bozza i dipendenti non la vedono proprio.

Gli avvisi stanno in `shift_notices`, che è il verso opposto di
`shift_messages`. Due tabelle e non una con una colonna «direzione» perché le
due cose **muoiono in modo diverso**: un rifiuto si chiude quando il
responsabile ha rimediato, un avviso quando l'interessato preme «ho letto».

## Una settimana sotto contratto si pubblica solo dopo averlo detto

Motore: `chiStaSottoContratto()` (`src/lib/pubblicazione.ts`), puro e provato
da `npm run prove`.

**In bozza una settimana incompleta è normale** — è tutto il senso della
bozza: si comincia da un foglio vuoto e ci si arriva. Ma premere Pubblica vuol
dire dire alla squadra «questa è la settimana», e una settimana che a qualcuno
dà **meno** ore di quelle che ha per contratto non è pronta: è un errore che
si scopre a fine mese, sulla busta paga, quando rimediare costa molto di più
che accorgersene adesso.

**Si ferma e chiede, non vieta.** La schermata mostra i nomi con le ore che
mancano e due strade: «Torno indietro» e «Pubblica lo stesso». I motivi buoni
per una settimana corta esistono — un rientro a metà settimana, un accordo con
la persona — e un divieto secco costringerebbe a inventarsi un'assenza che non
c'è pur di andare avanti. Il controllo ha già fatto il suo lavoro nel momento
in cui l'ha fatto vedere: quello che si scopriva a fine mese sulla busta paga
si vede adesso.

Non è un'impostazione e non si spegne. E dice **chi** e **di quanto**: un
avviso che non indica dove mettere le mani costringe a ricontare a mano trenta
persone, e a quel punto tanto valeva non averlo.

Chi non riguarda, e per lo stesso motivo — non ha un monte ore da rispettare:

- **chi è a chiamata**, che per definizione lavora quando serve;
- **chi non ha ore da contratto** scritte in scheda.

E **chi è assente conta solo per i giorni in cui c'è**: pretendere quaranta ore
da chi è in malattia da lunedì bloccherebbe la pubblicazione per sempre, e
quelle ore non le deve nessuno. La proporzione è la stessa del Prospetto
(`ore × giorni / 7`) e per la stessa ragione: di un giorno di assenza non si sa
quante ore avrebbe avuto. I turni scritti su un giorno di assenza non contano —
non li fa nessuno, e contarli farebbe passare per completa una settimana che
non lo è.

Il conto è arrotondato **per difetto**: su una settimana spezzata cade sui
minuti, e fermare una pubblicazione per un minuto di arrotondamento sarebbe una
regola che nessuno capirebbe. Se la lettura dei dati fallisce **non si chiede
niente**: una domanda basata su dati che non sono arrivati fermerebbe una
settimana magari a posto.

## La settimana si accetta intera

Alla **pubblicazione**, chi va oltre le sue ore da contratto non riceve otto
domande su otto turni: ne riceve **una sola sulla settimana**
(`conferma_settimana`, spento di suo).

Un turno per volta è il modo giusto di chiedere una modifica in corsa, ed è
quello sbagliato di chiedere «questa settimana ti va bene?»: la risposta
dipende dall'insieme, non dal singolo martedì. Chi vede otto richieste non sta
guardando la cosa che gli si sta chiedendo, e per rispondere dovrebbe rifare a
mente la somma che l'app ha già fatto.

- I turni **non** cambiano: restano validi e si vedono, come sempre da quando
  il verso è rovesciato. Cambia che la settimana si presenta in arancione
  finché la persona non si è espressa.
- **Il no vuole una motivazione**, obbligatoria — nella funzione del database,
  che è l'unico posto in cui vale sempre. Un no secco su sette giorni non
  lascia al responsabile niente di cui possa fare qualcosa, e la settimana va
  comunque rifatta.
- **Il sì può portarsi dietro un ritocco**: «va bene, ma il giovedì se
  possibile smetto prima». È la conversazione che c'è comunque, e che finora
  avveniva fuori dall'app. **Non sposta niente da solo**: lo legge il
  responsabile e decide lui. Un sì che cambiasse il tabellone non sarebbe un
  sì, sarebbe un permesso di scrittura sui propri turni.
- La riga è unica per `(azienda, persona, lunedì)` e **ripubblicare non
  richiede a chi ha già risposto**: una risposta data è una posizione presa, e
  riazzerarla perché il responsabile ha ritoccato il giovedì vorrebbe dire
  chiedere due volte la stessa cosa.
- Non la riceve **chi non ha un accesso** (non potrebbe rispondere, e la
  richiesta resterebbe in attesa per sempre) né **chi è a chiamata** (non ha un
  monte ore da sfondare).
- I minuti previsti e quelli da contratto sono **congelati alla nascita**: il
  tabellone cambia, e una richiesta deve poter raccontare la settimana su cui è
  nata.

## La fotografia di partenza (`stato_prima`)

Serve solo a poter rimettere il turno com'era. Quale fotografia si tiene,
quando ce n'era già una:

- se la versione di adesso l'interessato **l'aveva accettata**, è lei lo stato
  buono: si scatta una fotografia nuova, perché c'è un sì esplicito su quegli
  orari ed è lì che deve riportare un rifiuto successivo;
- altrimenti **si tiene quella vecchia**. Due ritocchi di fila a un turno
  pubblicato — 09-17 diventa 10-18, poi 11-19 — non fanno del 10-18 uno stato
  buono: è una versione intermedia che nessuno ha mai visto né accettato, e
  tornare lì sarebbe tornare in nessun posto.

`stato_prima` è **null su un turno nato adesso**: non c'è un «prima», e infatti
rifiutarlo lo toglie invece di riportarlo indietro.

### Il rifiuto diventa vero quando il responsabile apre i messaggi

Non quando il dipendente preme. `apriMessaggi()` è il punto in cui l'effetto
scatta, e la ragione è che **il tabellone non deve cambiare alle spalle di chi
lo ha costruito**: si vede cos'è successo nello stesso momento in cui succede.

Tre esiti possibili:

| Esito | Quando | Cosa resta |
|---|---|---|
| `ripristinato` | c'era un «prima» | il turno torna com'era |
| `da_rifare` | il turno era nato adesso | il turno si toglie, e resta **un buco da coprire**: il messaggio resta aperto finché non nasce un turno nuovo per quella persona in quel giorno |
| `superato` | il responsabile lo aveva già cambiato di suo | non si tocca niente: **l'ultima parola è la sua**, e un ripristino gli cancellerebbe il lavoro fatto dopo |

Dettagli che sembrano pignoleria e non lo sono:
- «il rifiuto è ancora quello di questo messaggio?» lo dice `rifiutato_at` sul
  turno, **non** un confronto campo per campo: ogni salvataggio del responsabile
  lo azzera, quindi trovarlo ancora lì significa che dopo il no nessuno ci ha
  più messo mano. Confrontando gli orari, un turno riassegnato a un'altra
  persona sarebbe sembrato intatto, e aprendo i messaggi il responsabile si
  sarebbe visto cancellare il rimedio appena messo in piedi;
- il messaggio **si prenota** (`visto_at` con `is null` nella where) prima di
  toccare il turno: due responsabili che aprono la casella insieme se lo
  contenderebbero, e il secondo scambierebbe un turno già ripristinato per uno
  cambiato a mano. Vince chi arriva primo;
- sullo stesso turno possono esserci due messaggi — rifiuto, modifica, altro
  rifiuto — e **comanda l'ultimo**;
- uno snapshot illeggibile **non** è un turno nato adesso: nel dubbio non si
  cancella niente, altrimenti un domani un cambio di forma di `stato_prima`
  trasformerebbe i ripristini in cancellazioni silenziose;
- il buco lasciato da un `da_rifare` **si chiude da solo** quando nasce un
  turno nuovo per quella persona in quel giorno. Uno per volta: chi fa mattina
  e sera ha due turni e può averne rifiutato uno solo.

## Assenze

**I turni di chi è assente non si cancellano.** Restano al loro posto, si
vedono in trasparenza e non contano da nessuna parte. È l'unico modo perché il
responsabile veda **cosa deve coprire**: cancellandoli, quei buchi sparirebbero
dallo schermo insieme ai turni.

Ma **a chi è già assente un turno nuovo non si assegna**: `salvaTurno` lo
rifiuta con un messaggio che dice la causale e fino a quando. Nascerebbe già
«in trasparenza», e chi lo ha messo crederebbe di aver coperto un buco.

`end_date = null` significa **ancora in corso**, ed è il caso normale, non
l'eccezione: chi si ammala non sa quando torna. Una sola assenza aperta per
persona (indice unico parziale) — due contemporanee non vorrebbero dire niente
e renderebbero ambiguo quale chiude il rientro.

Il **rientro** lo può confermare la persona stessa: si passa il primo giorno in
cui torna, e l'assenza finisce il giorno prima.

### Riservatezza — il punto più delicato dell'app

Il motivo di un'assenza dice cose sulla salute di una persona, e con la legge
104 anche su quella di un suo familiare. Non è un dato di servizio.

- Lo vedono **solo il responsabile e l'interessato**.
- Ai colleghi serve un'altra cosa, e una sola: sapere che quel giorno la
  persona non c'è, perché è ciò che rende scoperto un turno. Per questo esiste
  la vista `absence_days`, che il motivo **non lo seleziona proprio** — così
  non c'è niente da dimenticare di nascondere.
- Unica eccezione: `type = 'ferie'`, che tutta l'azienda vede. Le ferie sono un
  fatto d'agenda, e il calendario serve proprio a scegliere le settimane
  guardando quelle degli altri.
- La regola è identica su `absences` e su `vacation_requests`: la stessa
  malattia non può essere segreta da una parte e pubblica dall'altra.
- Controllo automatico: `node --env-file=.env.db scripts/verifica-riservatezza.mjs`.

## Richiesta ≠ assenza

Sono due cose, di proposito:
- la **richiesta** (`vacation_requests`) è un desiderio con uno stato, e nasce
  per forza «con riserva» — lo impone anche la policy di insert;
- l'**assenza** (`absences`) è il fatto che toglie ore.

L'approvazione **crea** l'assenza e se la segna in `absence_id`; la revoca di
una richiesta approvata **cancella** quell'assenza. Se qualcuno elimina
l'assenza a mano dalla Squadra, il riferimento si azzera da solo
(`on delete set null`).

## Quanto costa un'assenza (il Prospetto)

La regola meno intuitiva, e quella che nel dubbio va riletta qui.

> **Un'assenza costa le ore da contratto che quella settimana non sono state
> lavorate, non i turni che erano stati scritti.**

Chi ha 40 ore settimanali, sta a casa cinque giorni su sette e negli altri due
ne fa dieci, di quaranta **ne perde trenta** — e il tabellone di quei cinque
giorni poteva benissimo essere vuoto, com'è quasi sempre per una malattia che
comincia il lunedì. Contare i turni saltati darebbe zero.

Dettagli che seguono da lì:
- il conto è **settimanale** perché settimanale è il contratto; delle settimane
  a cavallo del periodo si conta la parte dentro;
- con **due causali nella stessa settimana** le ore si dividono in proporzione
  ai giorni: di un giorno di assenza non si sa quante ore avrebbe avuto, quindi
  non esiste una ripartizione più informata;
- **chi è a chiamata o non ha ore da contratto** non ha niente da cui
  sottrarre: per lui vale il conto dei turni saltati;
- `persi` e `saltati` sono **due numeri diversi e servono entrambi**: `persi` è
  quanto è costato alla persona, `saltati` è quanto il responsabile deve
  ricoprire;
- le ore attese su un mese o un anno sono riproporzionate (`ore × giorni / 7`):
  su una settimana il conto torna esatto, su un periodo diverso è **un'attesa,
  non un obbligo**, e così va letta.

## Copertura e turni oltre la mezzanotte

Motore: `src/lib/supervisione/copertura.ts`. Tutto in **minuti dalla
mezzanotte** del giorno mostrato.

- Un turno con `end_time <= start_time` **scavalca la mezzanotte** e vale sul
  giorno dopo. È la stessa convenzione in `durationMinutes()` (`lib/date.ts`) e
  in `minuti()` (`lib/prospetto.ts`).
- Un turno 18:00–02:00 **non è un turno solo**: è due pezzi, uno per giorno.
  `porzioneDelGiorno()` riporta l'intervallo sull'asse del giorno guardato.
- **Non contano come presenze** né i turni non assegnati né quelli di chi è
  assente: sono entrambi il buco che stiamo cercando, contarli lo
  nasconderebbe proprio a chi deve rimediare.
- La copertura si calcola a fette da 15 minuti. Le fette scoperte si uniscono
  **solo se dicono la stessa cosa**: unendo fette con presenze diverse, un buco
  «22:30–23:30, non c'è nessuno» nasconderebbe che fino alle 23:00 una persona
  c'era — ed è il numero su cui si decide se chiamare qualcuno.
- Fasce sovrapposte: vale la più esigente. Non dovrebbero sovrapporsi, ma è
  meglio chiedere troppo che accorgersi troppo tardi.
- `tintaDa()` dà a ogni persona un colore stabile fra un giorno e l'altro, e
  scarta i gialli fra 50 e 72 gradi perché illeggibili con testo scuro sopra.

## Il reparto di un turno

`repartoDelTurno()` (`src/lib/reparto.ts`), una funzione sola perché la
chiedono in tre punti: **il reparto scritto sul turno vince su quello della
persona**. Serve a dire «oggi copre in sala» senza spostarla di reparto per
sempre. Due elenchi che rispondessero diversamente farebbero dubitare di quale
sia il turno vero.

Quando si apre un turno per chi lavora in più reparti, la proposta di partenza
è il **reparto più frequente**, dedotto dai turni già fatti (vista
`reparto_piu_frequente`): le abitudini vere le sa il tabellone, non una
preferenza dichiarata.

## Come si propone una settimana

Motore: `src/lib/generazione.ts`. Le fasce di copertura dicevano già di quante
persone c'è bisogno e quando; qui si parte da lì e si propone **chi ci va**.

> **È una proposta, non una pubblicazione.** Il motore non scrive niente:
> restituisce i turni che metterebbe **e** i posti che non è riuscito a
> coprire, col motivo. Un generatore che riempie il tabellone e tace su quello
> che ha lasciato indietro è peggio di nessun generatore: il responsabile lo
> vede pieno e smette di controllare.

Le domande «chi c'è» e «quanti ne servono» non hanno una risposta nuova: sono
le stesse della Supervisione (`copertura.ts`, riusato pari pari). Due motori
che contano le presenze in due modi finirebbero per dire che una giornata è
coperta in una pagina e scoperta nell'altra.

### Dal buco al turno

1. Per ogni giorno e per ogni reparto si calcola la copertura a fette da 15
   minuti — le stesse fette della Supervisione.
2. Dove mancano *n* persone nascono **n posti sovrapposti**, non un posto «da
   n»: ognuno diventerà il turno di qualcuno, e due persone possono coprire
   ore diverse dello stesso buco.
3. Un posto che finisce a mezzanotte e quello che comincia a mezzanotte il
   giorno dopo, stesso reparto, sono **lo stesso turno**. Per la copertura un
   18:00–02:00 è due pezzi, ed è giusto così; ma il turno da proporre è uno, o
   si darebbe la sera a una persona e la notte a un'altra.
4. Un buco più corto di **due ore** si allarga fino a lì, restando dentro la
   fascia che lo ha chiesto. Senza, un collega che stacca alle 12:45 su una
   fascia che finisce alle 13:00 genererebbe un turno da un quarto d'ora.
   Allargarlo *fuori* dalla fascia no: vorrebbe dire far venire qualcuno in
   un'ora in cui l'azienda non ha chiesto nessuno.
5. Oltre **otto ore** filate il posto si spezza in pezzi uguali.

### Chi viene scelto, e in quale ordine

A parità di tutto decide il nome — non perché conti, ma perché **due giri
sugli stessi dati devono dare lo stesso tabellone**: un generatore che propone
cose diverse a ogni esecuzione non si riesce né a provare né a controllare.

| # | Criterio | Perché |
|---|---|---|
| 1 | chi ha un contratto, prima di chi è a chiamata | chiamare qualcuno è una telefonata e spesso un costo in più: si fa quando le ore già pagate sono finite |
| 2 | chi è più **sotto** le sue ore da contratto | è il numero rosso che il responsabile guarda nel tabellone, ed è il primo motivo per cui sta scrivendo la settimana |
| 3 | chi ha quel reparto come principale | prima di chi ci va di rinforzo |
| 4 | chi ha meno ore in settimana | per non caricare sempre gli stessi |
| 5 | il nome | non decide niente, rende ripetibile il risultato |

### Quello che il motore non farà mai

Sono tetti, non preferenze: chi non li rispetta viene escluso, e se non resta
nessuno il posto va fra gli **scoperti**.

- **Non supera le ore da contratto.** Lo straordinario è una decisione del
  responsabile, e nell'app è perfino una cosa che il dipendente può rifiutare
  (vedi «Preapprovazione»): non è roba che si genera da sé. Chi è a chiamata
  non ha un monte ore, quindi non ha questo tetto.
- **Non supera le dieci ore in un giorno.** Senza il tetto sulla giornata, i
  due pezzi di una fascia 08:00–22:00 finirebbero tutti e due alla stessa
  persona: non ha turni sovrapposti, magari non ha nemmeno il monte ore pieno,
  e sono quattordici ore.
- **Lascia undici ore fra un turno e quello del giorno dopo.** È il caso della
  chiusura seguita dall'apertura: chi smonta dalla notte alle 10:00 non ha
  niente di sovrapposto alle 10:00, quindi risulterebbe libero, e si
  incatenerebbe diciannove ore. Vale **solo fra giorni diversi**: nella stessa
  giornata il turno spezzato — mattina e sera — è normale nel commercio e
  nella ristorazione, e lo decide l'azienda, non questo file.
- **Non assegna niente a chi è assente**, e i turni di chi è assente non li
  conta come copertura: sono il buco che stiamo cercando.

### I tre modi di restare scoperti

Sembrano la stessa cosa e chiedono tre rimedi diversi, per questo il motivo si
porta dietro fino alla schermata:

| Motivo | Vuol dire | Si rimedia |
|---|---|---|
| `nessuno_nel_reparto` | in quel reparto non c'è nessuno che possa lavorarci | assegnare il reparto a qualcuno, o assumere |
| `tutti_occupati` | ci sono, ma quel giorno hanno già il loro | spostare un turno, o chiamare qualcuno |
| `oltre_contratto` | ci sono e sono liberi, ma andrebbero in straordinario | è una firma del responsabile, non una scelta del motore |

## Copia dei turni

`copiaTurni` in `turni/actions.ts`. Una settimana intera o un solo giorno.

**La corrispondenza è per posizione, non per differenza di date**: il lunedì
finisce sul lunedì anche saltando avanti di mesi. Contando i giorni si
sbaglierebbe attraversando il cambio dell'ora, dove una settimana non dura 168
ore esatte. `giorniCoinvolti()` (`lib/week.ts`) è condivisa fra server e
browser così i numeri dell'anteprima sono quelli che verranno scritti davvero.

Prima di premere si mostra **quanti turni ci sono nell'origine e quanti ne
verrebbero travolti** nella destinazione: i numeri veri prima, invece di
scoprire dopo che si è cancellato qualcosa.

## Importazione da foglio

**Il lettore si controlla da solo.** I tabelloni reali hanno una colonna `TOT`
con le ore di ogni giorno: il parser ricalcola quelle ore dagli orari e le
confronta (tolleranza 0,02 h). Se non coincidono ha letto male una casella, e
**lo dice prima di salvare** invece di importare dati sbagliati in silenzio. È
il controllo che rende sicuro un parser scritto a mano.

Due strutture riconosciute:
- **larga** (`wide`) — una riga per persona, ogni giorno su più colonne
  `Da | A | Da | A | TOT`, che permette il turno spezzato;
- **elenco** (`long`) — una riga per turno: Nome, Data, Da, A.

Le caselle che non sono orari vengono riconosciute e **non diventano turni**:
`R` riposo, `F` ferie, `A` assenza, `M` malattia, `P` permesso, `RC` recupero,
`FS` festivo.

Abbinamento dei nomi (`match.ts`): regge accenti, apostrofi, doppi spazi e
l'ordine invertito — «Marcinnò Concetta» e «Concetta Marcinnò» sono la stessa
persona. Ma **un solo candidato è un abbinamento, due sono un dubbio**: meglio
far scegliere che indovinare.

Trappole del formato Excel già risolte, da non reintrodurre: le date arrivano
come mezzanotte **UTC** (leggerle in ora locale sposterebbe il giorno indietro
a ovest di Greenwich); gli orari sono frazioni di giornata (0,625 = 15:00); i
seriali contano dal 30/12/1899; le intestazioni dei fogli veri sono **celle
unite**.

## Persone senza account

Finora un profilo *era* un account. Da `07-persone-senza-account.sql` le due
cose sono separate: `profiles.user_id = null` vuol dire che la persona è in
squadra, va in turno, compare nei conti, ma nell'app non entra.

Il motivo: su un tabellone da trenta persone, di cui metà non aprirà mai
l'app, pretendere trenta indirizzi email prima di poter scrivere il primo
turno è un ostacolo senza ragione.

Conseguenze: `auth.uid()` **non è più** l'id del profilo — serve
`current_profile_id()`; incollando un elenco si creano persone senza accesso;
l'accesso si dà dopo, a chi serve (`creaAccesso`); un **responsabile** invece
deve per forza averlo.

## Trascinare le barre nella Supervisione

`src/lib/supervisione/trascina.ts`. Una barra si prende **per i bordi** (cambia
l'orario di inizio o di fine) o **per il centro** (si sposta intera, stesse
ore). Il file decide solo dove finisce la barra: niente puntatore, niente
pixel — il componente converte i pixel in minuti, e qui arriva solo il delta.
Così si prova senza browser (`scripts/prova-trascina.mjs`).

- Il passo è **15 minuti**, la stessa granularità delle fette di copertura.
  È il *delta* a essere agganciato, non gli orari: un turno delle 09:10
  trascinato resta sui suoi dieci minuti.
- Un trascinamento che non arriva a mezzo passo lascia il turno com'è. Senza
  questa riga un turno lunghissimo si accorcerebbe al massimo consentito anche
  solo sfiorandolo.
- L'inizio resta dentro il suo giorno: spostarlo prima della mezzanotte
  cambierebbe la data, e quella si cambia dal pannello. L'ultimo inizio
  possibile è le **23:45** — fermarsi a 23:59 darebbe orari che nessuno
  scriverebbe a mano.
- La durata non scende sotto un passo e non arriva mai a un giorno intero:
  inizio e fine uguali il salvataggio li rifiuta.

## Le pagine si possono spegnere

Non tutte le aziende usano tutto: chi non ha regole di copertura non sa cosa
farsene della Supervisione, chi le assenze le segna sul quaderno non vuole i
Permessi in mezzo ai piedi.

`pagina_supervisione`, `pagina_permessi`, `pagina_prospetto`. Spente,
spariscono dal menu **e** il loro indirizzo riporta ai Turni: nascondere non
basta, l'indirizzo se lo ricorda il browser. Sono quindi due posti da tenere
d'accordo — `src/app/(app)/layout.tsx` e la guardia dentro ciascuna pagina.

**Turni, Squadra e Impostazioni non si spengono**: senza il tabellone l'app non
ha più un motivo, senza Squadra non si aggiunge nessuno, e senza Impostazioni
non si potrebbe più riaccendere niente.

## Le dieci impostazioni dell'azienda

`company_settings`, tutte facoltative (senza riga valgono i default).

Nel database sono raggruppate per pagina; **nella schermata dei Turni sono
raggruppate per gesto** — quando pubblichi, quando cambi un turno già
pubblicato, quando ne aggiungi uno — e ognuna dice su due righe *quando*
scatta e *cosa succede se la persona dice di no*. Un elenco di levette in fila
obbligava a leggerle tutte per capire quale riguardasse la cosa che si stava
facendo, e quello che cambia non è un'opzione: è cosa succede quando si preme
un bottone.

Fra loro sta anche una **regola che non si spegne** — non si pubblica una
settimana sotto contratto — perché è lì che uno la cerca: scoprirla solo nel
momento in cui l'app dice di no sarebbe peggio.

| Impostazione | Default | Effetto |
|---|---|---|
| `conferma_straordinari` | ❌ | un turno nuovo oltre le ore da contratto è rifiutabile |
| `conferma_modifiche` | ❌ | modificare una settimana pubblicata coinvolge l'interessato: **rifiutabile se aggiunge ore o sposta il turno, un avviso se ne toglie** — straordinario compreso |
| `orari_preimpostati` | ❌ | un turno diverso dall'orario del contratto è rifiutabile |
| `conferma_cambio_reparto` | ❌ | anche il solo cambio di reparto è rifiutabile |
| `conferma_settimana` | ❌ | alla pubblicazione, chi va in straordinario accetta o rifiuta la settimana intera |
| `pagina_supervisione` | ✅ | l'azienda usa la Supervisione |
| `supervisione_dipendenti` | ✅ | la vedono anche i dipendenti |
| `pagina_permessi` | ✅ | l'azienda usa i Permessi |
| `causali_richiedibili` | tutte | cosa un dipendente può chiedere. Il responsabile, registrando a mano, le ha sempre tutte |
| `pagina_prospetto` | ✅ | l'azienda usa il Prospetto |

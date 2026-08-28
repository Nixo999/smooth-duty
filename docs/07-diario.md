# Diario

Cosa è cambiato, quando, e **perché**. Il documento da leggere per primo dopo
un cambio di chat o una pausa: dice dove si era arrivati.

**Regola: dopo ogni pezzo finito, una voce qui.** Una riga, in cima alla
giornata giusta, con il perché. Le voci fino al 25 agosto 2026 sono state
ricostruite dalla storia dei commit.

---

## 28 agosto 2026

**Chi è a chiamata smette di essere «quello senza contratto»** — migrazione `19`
Era definito da ciò che non ha: nessun monte ore, nessun orario preimpostato,
nessuna settimana da accettare. L'accordo vero — «il giovedì no», «i weekend
sì» — viveva in una telefonata di cui l'app non sapeva niente, e il
responsabile se lo ricordava a memoria. Adesso si scrive, e l'azienda sceglie
in che forma: `indisponibilita` (segna quando non può), `disponibilita` (segna
quando può, e il vincolo passa al datore), `on_demand` (nessun calendario: si
propone e lui risponde). Tre contratti diversi fra datore e lavoratore, non
tre livelli della stessa cosa — per questo nelle Impostazioni è una scelta fra
tre e non tre levette: due accese non vorrebbero dire niente.

**Il default è quello che non cambia niente**
`indisponibilita`, e non per gusto: senza dichiarazioni non blocca nessuno, e
chi aggiorna senza sapere che questa colonna esiste continua a lavorare come
ieri. Con `disponibilita` come default, la mattina dopo nessuna azienda
avrebbe più potuto mettere in turno un lavoratore a chiamata.

**Il verso sta sulla riga, non solo nell'impostazione**
`availability_days.verso` esiste per una ragione sola: il regime si cambia da
una schermata, e senza quella colonna tutte le dichiarazioni già date si
rovescerebbero di senso in silenzio — «il 12 non posso» diventerebbe «il 12
posso», e lo si scoprirebbe mandando qualcuno a lavorare in un giorno in cui
aveva detto di non esserci. Cambiando regime, quelle vecchie restano scritte e
smettono di contare.

**Il controllo sta nella Server Action, non in un trigger**
Segue il precedente più vicino — «a chi è già assente un turno nuovo non si
assegna» — e per le stesse due ragioni: non è un vincolo di integrità ma una
regola che l'azienda può cambiare, e chi preme Salva legge una frase italiana
che dice cosa fare invece di un errore di Postgres. Nella copia il controllo
sta **prima** della cancellazione della destinazione: con «sovrascrivi» acceso,
scoprirlo dopo vorrebbe dire aver svuotato una settimana per riempirla a metà.

**`on_demand` rovescia di nuovo il verso, ma solo per chi è a chiamata**
Dalla `14` il turno vale subito e chi tace ha accettato. Lì è giusto: quel
turno gli spetta comunque. Per chi è a chiamata no — il senso di quel regime è
che ogni chiamata va accettata — e «chi tace ha accettato» vorrebbe dire dare
per presente lunedì mattina qualcuno che l'app non l'ha nemmeno aperta. È
l'unico posto in cui il silenzio non vale come un sì, e la posta lo scrive:
«finché non rispondi questo turno non è tuo». La singola chiamata usa la
macchina che c'era già (`accetta_turno`, `rifiuta_turno`, `stato_prima`); la
settimana intera usa `week_requests`, che dalla `16` aveva lasciato la porta
aperta con la colonna `motivo`.

**Il tabellone dice quali caselle sono chiuse prima del clic**
Sulle righe di chi è a chiamata compare quello che ha dichiarato, e sotto la
lista bianca i giorni senza dichiarazione si vedono in grigio. Senza,
costruire una settimana sarebbe stato un giro di tentativi — scrivi, salva,
leggi il rifiuto, riprova — cioè esattamente il lavoro che questa app dovrebbe
togliere.

**La proposta automatica non propone quello che il salvataggio poi rifiuta**
`generaTurni` conosce le disponibilità, e chi non c'è finisce fra gli scoperti
con un motivo suo, `non_disponibile`: si rimedia chiedendo una disponibilità,
non spostando un turno. Il controllo viene prima di quello sugli impegni,
altrimenti «sono tutti occupati» si sarebbe detto anche di chi quel giorno non
c'è proprio.

**Le disponibilità del responsabile stanno nel tabellone, non in una pagina
sua**
La prima versione dava una pagina «Disponibilità» anche a lui, con l'elenco
delle persone e un calendario per ciascuna. Sbagliato, e il motivo è il
mestiere: per il responsabile la disponibilità e il turno sono la stessa
domanda guardata da due parti — «chi posso mettere sabato» — e su due schermate
dovrebbe tenere a mente l'una mentre guarda l'altra. Adesso è una **seconda
vista** del tabellone: stesso interruttore accanto alla settimana, stessi sette
giorni, stessa ricerca, cambia solo cosa c'è scritto nelle caselle. E in quella
dei turni le dichiarazioni restano comunque visibili in ogni casella — leggerle
non deve costare nemmeno un clic.

Ne è uscita anche una cosa che il calendario per persona non sapeva fare: la
selezione attraversa le **persone**, non solo i giorni. Il ponte in cui non c'è
nessuno dei tre si segna in una passata sola. La pagina `/disponibilita` resta,
ed è solo del dipendente: lui il tabellone non lo guarda, guarda i suoi giorni.

**Il calendario si tocca a più giorni per volta**
Il tocco seleziona e non scrive; una barra in fondo offre «tutto il giorno»,
«solo alcune ore», «togli». Un weekend o un mese si segnano in un gesto, e le
fasce orarie restano visibili invece di nascondersi dietro un tocco lungo che
nessuno scoprirebbe. Il responsabile può segnare al posto di
qualcuno, dal tabellone: la telefonata è il modo in cui queste cose si dicono
davvero, e senza quella strada la dichiarazione non verrebbe scritta mai.

**La disponibilità non la vedono i colleghi**
Solo l'interessato e il responsabile. Le ferie di un collega le vede tutta
l'azienda perché sono un fatto d'agenda; questa dice quando una persona ha
l'altro lavoro, l'università, il figlio da prendere a scuola — riguarda il
rapporto fra lei e chi la chiama, e basta.

---

## 26 agosto 2026

**«Quel link non vale più» era falso: valeva, ma nel browser sbagliato**
Il recupero finiva sull'accesso e la pagina dava la colpa alla scadenza. Il
motivo vero è un altro: lo scambio PKCE cerca un cookie che la richiesta di
recupero lascia **nel browser da cui parte**, e il client di posta apre i link
nel browser predefinito. Verificato che il cookie viene scritto correttamente e
che il giro completo funziona quando il browser è lo stesso — link generato per
un account di prova, aperto con un barattolo di cookie: sessione creata e
atterraggio su «Scegli la tua password».

Ora `/conferma` distingue i due casi e dice quello giusto. Un messaggio
sbagliato qui non è un dettaglio di forma: mandava la persona a chiedere un
altro link, che sarebbe fallito identico.


**Il link del recupero non porta più a localhost**
Il Site URL del progetto era ancora `http://localhost:3000` e la lista degli
indirizzi di ritorno era vuota: Supabase ignorava il `redirectTo` dell'app e
ripiegava sul Site URL, quindi la mail conteneva un link al computer di chi
l'aveva chiesto. Sistemati tutti e due dal pannello. La misura, prima e dopo,
si fa senza aprire niente:

```bash
curl -sI "$SUPABASE_URL/auth/v1/verify?token=finto&type=recovery" -H "apikey: $ANON" | grep -i location
```

Resta fuori il modello della mail: **non è modificabile finché si usa il
mittente incluso di Supabase**, e senza la forma `TokenHash` il link vale solo
sul dispositivo da cui è partita la richiesta. Dettagli in
[08-aperto.md](08-aperto.md).


**Password dimenticata, e un tetto ai tentativi** — migrazione `18`
L'app è su un dominio pubblico: da lì una password si indovina provando, e
finora si poteva provare all'infinito. Ora il conto dei tentativi falliti sta
nel database — in memoria non conterebbe niente, le funzioni nascono e muoiono
a ogni richiesta — con due chiavi: per indirizzo e per provenienza di rete,
perché chi prova la stessa password su tutta l'azienda al primo limite
sfuggirebbe. Le funzioni del contatore hanno l'esecuzione **revocata** a
`anon`: nascendo pubbliche, chi stava provando avrebbe potuto azzerarsi il
blocco da solo.

Il recupero password riusa la pagina che c'era: `/conferma` verifica il codice
della email e alza `must_change_password`, così chi entra dal link passa dallo
stesso controllo di chi ha una password provvisoria — nessuna scorciatoia nuova
da sorvegliare. La risposta è identica che l'indirizzo esista o no.

Aggiunte anche le intestazioni di sicurezza e il minimo di 10 caratteri.
⚠️ **Perché la mail parta davvero servono tre cose nel pannello Supabase**, che
dal codice non si possono fare: [08-aperto.md](08-aperto.md).

Provato: il limite blocca all'undicesimo tentativo passando dall'azione vera,
non solo dal database; `anon` si prende `42501` su tutte e tre le funzioni; il
recupero su un indirizzo inesistente risponde comunque «ok». Le righe di prova
ripulite, tabella a zero.

⚠️ **Non provato**: il giro completo della email. Senza SMTP configurato non
parte niente, quindi il link vero non l'ho mai aperto.


**La 16 e la 17 eseguite sul database: i dipendenti non entravano più**
Su denkishift.it il responsabile entrava e i dipendenti prendevano un errore
del server su `/turni`. Il codice pubblicato era quello nuovo — `shift_notices`
e `week_requests` — e il database si era fermato alla `15`. La forma del
guasto era chiara: `shift_notices` la interroga **solo** il ramo del
dipendente, il responsabile riceve una lista finta e non tocca mai la tabella
mancante. Eseguite `16` e `17`, riverificate tutte e 17 le migrazioni, e
ricontrollate dall'API le sei letture della pagina: passano tutte, comprese le
tabelle nuove. Nessun deploy necessario: mancava solo il database.

⚠️ **Il progetto si lavora da due macchine, e questa lezione è costata due
ore.** Ero partito ad analizzare codice vecchio di 13 commit e ho cercato la
causa nel posto sbagliato. Prima di diagnosticare qualunque cosa: `git fetch`,
poi `verifica-schema.mjs`. In quest'ordine — lo schema si controlla contro il
codice aggiornato, non contro quello che si ha in mano.

**Una riga che spegne la pagina di tutti i dipendenti** — `c2d0148`
Cercando quella causa è saltata fuori una fragilità vera, indipendente:
`oggiCivile()` usa `Intl` con il fuso scritto per nome, e dove i dati dei fusi
non ci sono quella riga non sbaglia il giorno, solleva. Sta nel render della
settimana del dipendente e solo lì. Ora ha un ripiego sulla data UTC — per due
ore a notte può dire ieri, e il database la parola definitiva ce l'ha comunque.
Provata anche la strada che scatta, con `Intl` costretto a sollevare.

**«Could not find the column in the schema cache»: le migrazioni non erano
state eseguite**
Salvando le Impostazioni su denkishift.it l'app chiedeva `conferma_settimana`
e il database non ce l'aveva: la `16` e la `17` erano scritte e mai lanciate.
Non c'era niente da correggere nel codice. Le due migrazioni ora finiscono con
`notify pgrst, 'reload schema'`, perché PostgREST tiene una copia dello schema
in memoria e la ricarica da sé ma non sempre subito — e nel frattempo dà lo
stesso errore anche a migrazione eseguita, che è il modo migliore per perderci
un pomeriggio.

**Le impostazioni parlano la lingua di chi le legge**
Erano scritte con le parole del dominio interno — «preapprovato», «motivo di
rifiuto», «monte ore», «l'interessato viene coinvolto» — cioè le parole di chi
ha scritto il codice, non di chi gestisce un negozio. Riscritte tutte: frasi
corte, il soggetto è sempre il dipendente o tu. La struttura è rimasta, era
quella giusta.

**Il divieto alla pubblicazione diventa una domanda**
Una settimana in cui qualcuno sta sotto le sue ore adesso si ferma, mostra i
nomi con le ore che mancano e chiede: «Torno indietro» o «Pubblica lo stesso».
I motivi buoni per una settimana corta esistono — un rientro a metà settimana,
un accordo con la persona — e un divieto secco costringeva a inventarsi
un'assenza che non c'è pur di andare avanti. Il controllo ha già fatto il suo
lavoro nel momento in cui l'ha fatto vedere: quello che si scopriva a fine mese
sulla busta paga si vede adesso.

**Non si pubblica una settimana in cui qualcuno sta sotto il suo contratto**
In bozza va benissimo — è tutto il senso della bozza — ma premere Pubblica
vuol dire dire alla squadra «questa è la settimana», e un buco di ore così si
scopre a fine mese sulla busta paga, quando rimediare costa molto di più.
Il messaggio dice chi e di quanto: un divieto che non indica dove mettere le
mani costringe a ricontare a mano trenta persone. Chi è assente conta per i
giorni in cui c'è, con la stessa proporzione del Prospetto. Motore puro in
`src/lib/pubblicazione.ts`, dodici casi in `npm run prove`.

**Spostare un turno si chiede, non si comunica** — migrazione `17`
La `16` lo aveva messo fra gli avvisi: stesse ore, niente da concedere. Era un
ragionamento da contabile. Il mattino e il pomeriggio non sono la stessa
giornata — chi porta i figli a scuola alle otto, chi ha un secondo lavoro —
e un turno che passa dalle 06–14 alle 14–22 cambia tutto a ore identiche.

**Un interruttore solo per le modifiche, non due**
`conferma_modifiche_straordinari` sparisce dalla schermata: erano due metà
esclusive, e chi accendeva quella generale non veniva avvisato proprio del
caso più grosso — mandare qualcuno oltre il contratto passava in silenzio.
Il motivo continua a distinguerli, perché all'interessato non è indifferente.
La colonna resta nel database, inutilizzata.

**I motivi di rifiuto erano in tre posti, e il terzo era dimenticato**
Aggiungendo `turno_spostato` è saltato fuori che `ripristinaTurni` validava
con un elenco suo: avrebbe rifiutato i turni col motivo nuovo, in silenzio.
Ora l'elenco è uno solo (`MOTIVI_RIFIUTO`), e da lì si derivano il tipo e la
validazione. Una delle trappole di [08-aperto.md](08-aperto.md) in meno.

**Le impostazioni dicono quando scattano e dove vanno a finire**
Ogni levetta ha ora due righe sue — «Quando» e «Se dice no» — invece di un
paragrafo in cui bisogna trovarle leggendo. Sono le due domande che uno si fa
davanti a un interruttore.

**Togliere ore e aggiungerne non sono la stessa domanda** — migrazione `16`
Una modifica a una settimana pubblicata era rifiutabile in qualunque verso
andasse. Ma chi si vede accorciare il turno non ha niente da concedere: ha
diritto di saperlo. Ora gli esiti sono tre — si chiede, si avvisa, si tace —
e la regola sta in `conseguenzaDelSalvataggio()`, pura, sedici casi in
`npm run prove`. Nascono `shift_notices` (gli avvisi, che si chiudono con «ho
letto») e `week_requests`.

**La settimana si accetta intera** — migrazione `16`
Alla pubblicazione, chi va oltre le sue ore riceve una domanda sola
sull'insieme invece di una per turno: un turno per volta è il modo giusto di
chiedere una modifica in corsa ed è quello sbagliato di chiedere «questa
settimana ti va bene?». Il no vuole la motivazione, il sì può portarsi dietro
un ritocco che però **non sposta niente da solo** — lo valuta il responsabile.
Si accende con `conferma_settimana`, spento di suo.

**Una cosa da decidere dentro un giorno si vede solo se si guarda quel
giorno**
I due bottoni del dipendente stavano attaccati al loro turno. Chi apre l'app
il lunedì non scorre fino a sabato, e un turno cambiato di sabato restava lì
ad aspettare. Nasce la posta, in cima alla schermata: si chiude ma non
sparisce, sparisce solo dopo una risposta.

**Le frecce non si spengono più quando confermi**
Premuto Conferma, il lavoro appena mandato smetteva di poter tornare
indietro. Ora il blocco confermato è una voce di storia sola: indietro lo
disfa tutto, come per lo svuotamento. Disfacendo si tolgono prima i turni
creati e poi si rimettono quelli di prima, o la persona si ritroverebbe tutti
e due.

**Le impostazioni dei Turni si leggono per gesto, non per tipo**
Sei levette in fila obbligavano a leggerle tutte per capire quale riguardasse
la cosa che si stava facendo. Ora sono tre gruppi — quando pubblichi, quando
cambi un turno già pubblicato, quando ne aggiungi uno — e ognuna racconta il
procedimento intero.

**Sospendere una persona è un bottone nella riga**
Esisteva già, in fondo a un elenco di campi dentro la scheda: il gesto più
frequente della Squadra nel posto meno raggiungibile.

> ⚠️ Tutto quanto sopra è **scritto e non visto a schermo**: sul Mac mancano
> le chiavi Supabase. Passano prove, tsc, eslint e build. L'elenco di cosa
> resta da guardare, in ordine, sta in [08-aperto.md](08-aperto.md) — e la
> migrazione `16` non è ancora stata eseguita su nessun database.

**Lo script dei dati di prova non partiva da tre giorni, e nessuno se n'era
accorto**
In `dati-di-prova.mjs` un `\n` era finito nel codice come a capo vero, dentro
una stringa: il file non si leggeva proprio, `SyntaxError` prima ancora di
eseguire una riga. È entrato col commit che toglieva le password di ripiego
(`811e038`) — quel messaggio d'errore è nato lì. Non se n'era accorto nessuno
perché lo script si lancia solo quando serve popolare un'azienda, e nel
frattempo nessuno l'aveva fatto. `npx eslint scripts` lo vedeva già.

**Le fasce di copertura sapevano già cosa serve: adesso propongono anche chi**
Nasce `src/lib/generazione.ts`, il motore che da una settimana vuota tira fuori
i turni che metterebbe. Non scrive niente e non ha ancora un bottone: è una
funzione pura, provata da `npm run prove` con ventitré casi. Riusa
`copertura.ts` invece di ricontare le presenze per conto suo — due motori che
contano in due modi direbbero che una giornata è coperta nella Supervisione e
scoperta qui.

Restituisce **anche gli scoperti col motivo**, ed è la parte che conta: un
generatore che riempie il tabellone e tace su quello che ha lasciato indietro
è peggio di nessun generatore, perché il responsabile lo vede pieno e smette
di controllare. `nessuno_nel_reparto`, `tutti_occupati` e `oltre_contratto`
chiedono tre rimedi diversi.

Due difetti trovati scrivendo le prove, non leggendo il codice: una fascia
08:00–22:00 si spezzava in due pezzi da sette ore e li dava **alla stessa
persona** (nessun turno sovrapposto, monte ore capiente: quattordici ore in un
giorno); e chi smontava dalla notte alle 10:00 risultava libero alle 10:00, e
si incatenava diciannove ore. Da lì il tetto sulla giornata e le undici ore di
riposo fra giorni diversi. Le regole per esteso in
[04-regole.md](04-regole.md).

**Su una macchina nuova non c'era niente da copiare**
Il README diceva «copia `.env.local.example`», ma quel file non esisteva e non
poteva esistere: `.gitignore` esclude `.env*` senza eccezioni. Chi montava il
progetto altrove doveva indovinare i nomi delle variabili leggendo il codice.
Ora i due modelli — `.env.local.example` e `.env.db.example` — sono in git con
dentro solo segnaposto, e l'esclusione ha le sue due eccezioni.

**Il progetto si lavora da due macchine, e i documenti smettono di darne per
scontata una**
Un Mac si è aggiunto al Windows su cui l'app è nata. I documenti scrivevano il
percorso di lavoro come se ce ne fosse uno solo, e tre cose non partivano
proprio da qui: `npm run apk` invocava `gradlew.bat`, il wrapper `gradlew`
arrivava da git senza il bit di esecuzione, e `org.gradle.java.home` in
`android/gradle.properties` è un percorso `C:\`. Le prime due sono state
sistemate (`scripts/apk.mjs` sceglie il nome giusto); la terza no, di
proposito: toglierla romperebbe la build dell'altra macchina, e Gradle legge
comunque per primo `~/.gradle/gradle.properties`. In
[06-ambiente.md](06-ambiente.md) c'è ora anche il modo di lavorare in parallelo
senza pestarsi i piedi — pull prima di cominciare, `verifica-schema.mjs` subito
dopo, commit piccoli, mai un `--force` su `main`.

**Le migrazioni 13, 14 e 15 eseguite sul database «swift control»**
Il database era fermo alla 12 mentre il codice era alla 15: mancavano
`shifts.rifiutato_at`, `nota_rifiuto`, `stato_prima`, la tabella
`shift_messages`, le quattro colonne della 13 e le funzioni `rifiuta_turno` /
`accetta_turno`. Postgres rifiutava l'intera lettura dei turni e il tabellone
si presentava vuoto. Dati intatti: **429 turni, 36 persone, 3 aziende** prima e
dopo. Verificato rieseguendo le sette letture della pagina Turni.

**`verifica-schema.mjs` copre tutte le 15 migrazioni, e dice quale manca**
Il vecchio script controllava solo fino alla 04 e rispondeva «schema completo»
mentre ne mancavano tre: uno strumento che mente con la faccia convinta è
peggio di nessuno strumento. Ora i controlli sono raggruppati per migrazione,
distinguono «mai eseguita» da «eseguita a metà» e stampano il comando da
lanciare. Provato anche il percorso negativo, falsificando una colonna: se non
lo si prova, la prossima volta dice «ok» e nessuno se ne accorge.

## 25 agosto 2026

**Un errore di lettura non si traveste più da settimana vuota** — `e59aa61`
Le pagine leggevano con `data ?? []`: un errore diventava un elenco vuoto, e un
tabellone che non si riesce a leggere è indistinguibile da uno cancellato.
Nasce `<ErroreDati>`, che riconosce anche il caso più frequente — migrazioni
SQL non eseguite dopo un aggiornamento.

**Il sì detto sposta il punto a cui si torna** — `b13dceb`
Se l'interessato aveva accettato la versione di adesso, è quella lo stato buono
e `stato_prima` si riscatta su di lei. Altrimenti si tiene la fotografia
vecchia: una versione intermedia che nessuno ha mai visto non è un posto a cui
tornare.

**La 14 dice dove è finita la sua funzione** — `f85ce57`
`rifiuta_turno()` è definita nella `14` e ridefinita nella `15`: la `14` ora lo
dice, così chi la deve cambiare non modifica quella morta.

**Anche in Supervisione un turno rifiutato si vede** — `54c5f6e`

**Accanto al no torna il sì, e il tabellone dice a che punto sta** — `db9201a` ·
migrazione `15`
Con il solo «no» il responsabile vedeva due stati: rifiutato, e tutto il resto —
dentro cui stavano insieme chi aveva letto ed era d'accordo e chi non aveva
ancora aperto l'app. Sabato sera sono due situazioni diverse. Nasce
`accetta_turno()` e con lei `lib/conferme.ts`, che dà la stessa risposta alle
tre schermate che la chiedono.

**Il rifiuto guarda il rifiuto, non gli orari; e la fotografia tiene il nome** —
`d510418`
Se un turno è ancora rifiutato lo dice `rifiutato_at`, non un confronto campo
per campo: un turno riassegnato a un'altra persona sarebbe sembrato intatto, e
aprendo i messaggi il responsabile si sarebbe visto cancellare il rimedio
appena messo in piedi. E `stato_prima` porta anche `profile_id`, altrimenti il
ripristino rimetteva gli orari giusti addosso a chi il turno l'aveva rifiutato.

**Il turno vale subito, e chi non ce la fa lo rifiuta** — `4a8ffb3` ·
migrazione `14`
Il cambio di verso più grosso del progetto: la preapprovazione. Il responsabile
non aspetta più che i dipendenti confermino uno per uno; chi non può, rifiuta e
lascia un messaggio. Nasce `shift_messages`, e `conferma_turno()` viene tolta —
tenerla avrebbe voluto dire avere due verità su cosa vale un turno.

**Le impostazioni si leggono per pagina, e le pagine si spengono** — `d3e20dd` ·
migrazione `13`
Non tutte le aziende usano tutto. Supervisione, Permessi e Prospetto si possono
spegnere: spariscono dal menu **e** il loro indirizzo riporta ai Turni. Arriva
anche `conferma_cambio_reparto`: spostare qualcuno di reparto senza toccargli
un minuto non è la modifica per cui si disturba una persona.

**Una settimana svuotata si rimette; e i turni si aggiustano tirandoli** —
`9e05c8f`
«Svuota» diventa annullabile — ed è il server a fotografare i turni mentre li
toglie, perché il tabellone del browser può essere di dieci minuti fa. Nella
Supervisione le barre si trascinano: motore in `lib/supervisione/trascina.ts`,
provato da `scripts/prova-trascina.mjs`.

## 25 agosto 2026 (mattina)

**Le modifiche si accumulano e partono insieme; una settimana svuotata torna
bozza** — `ffa9fcd`
Nasce `lib/turni-staging.ts`, condiviso fra Turni e Supervisione: su una
settimana pubblicata si preme Modifica, si lavora su una copia locale e solo
Conferma spedisce. Due implementazioni separate sarebbero divergute al primo
bug. E `riportaInBozzaSeVuota()`: una settimana rimasta senza turni non è
«pubblicata e vuota», è da rifare.

**Ogni settimana nasce bozza; e il contratto si chiama col suo nome** —
`1e0d568` · migrazione `12`
Rovesciato il verso della pubblicazione: si passa da `draft_weeks` (ritirata) a
`published_weeks`. Una tabella di bozze presuppone che qualcuno si ricordi di
marcarle, e una settimana dimenticata finirebbe in faccia ai dipendenti a metà.
Nasce anche `profiles.contract_type` (`chiamata` | `part_time` | `full_time`):
lo dice la scheda della persona, non una soglia automatica sulle ore.

**Impostazioni dell'azienda, conferme dei dipendenti, bozze, e i Turni
riordinati** — `cb94eb3` · migrazione `11`
Arrivano `company_settings`, `shifts.richiede_conferma` / `confermato_at`, la
funzione `conferma_turno()` e l'orario preimpostato da contratto sulla persona.
Da qui un turno può aspettare un sì dell'interessato.

## 24 agosto 2026

*La giornata più densa del progetto: dalla prima versione completa a quasi
tutto quello che c'è adesso.*

**La lentezza vera sta nell'oceano: funzioni in Ohio, database in Irlanda** —
`b167ef8`
Misurata la latenza reale: ogni giro dall'Ohio costa ~90 ms invece di ~10, e
ogni pagina ne fa due o tre. Documentata la regione da impostare su Netlify.

**Da Ferie a Permessi: si chiede qualunque assenza, e i turni la rispettano** —
`67b14a1` · migrazione `10`
La richiesta porta la sua causale, che all'approvazione passa pari pari
nell'assenza. Riservatezza per causale: le ferie le vede tutta l'azienda, ogni
altra causale resta fra interessato e responsabile. `/ferie` diventa un
redirect a `/permessi`.

**Le ferie si chiedono con riserva, e la Supervisione parte dal proprio
reparto** — `b2fc945` · migrazione `09`
Nasce `vacation_requests`: la richiesta è un desiderio con uno stato, l'assenza
è il fatto. L'approvazione crea l'assenza e se la segna, così la revoca sa cosa
cancellare.

**L'ingresso salta un giro, e il tabellone si filtra per reparto** — `7a48abd`
Il login manda direttamente a destinazione invece di rimbalzare su `/`: quel
rimbalzo era un giro di rete intero, e sull'ingresso si sente tutto.

**Il click risponde subito, e il proxy non va più a Supabase per niente** —
`ed2e04e`
`proxy.ts` rinnova il token solo quando sta per scadere: prima ogni click e
ogni prefetch pagavano un giro fino a Supabase per sentirsi dire che non c'era
niente da rinnovare.

**Su iPhone il mouse non passa mai: il menu dell'account non si apriva** —
`f251063`

**La propria password si cambia quando si vuole, non solo al primo accesso** —
`6ef1ea0`
`cambiaLaMiaPassword` verifica la password attuale **rifacendo l'accesso**:
Supabase da solo non la controlla, e senza quel passaggio chi trovasse aperta
l'app di un collega potrebbe prendersi l'account in tre secondi.

**Sotto l'orario il reparto, non la mansione; e la sessione si chiede una
volta** — `f99b691`
`getViewer()` viene memorizzata con `cache()`: girava tre volte per pagina, e
ogni giro è un `auth.getUser()` più due letture.

**Il turno si aggiusta dove lo si vede storto: dalla Supervisione** — `7aa6da7`
Lo stesso pannello turno dei Turni, dentro la Supervisione.

**Un'assenza costa le ore da contratto, non i turni che erano scritti** —
`891505e`
Riscritto il conto del Prospetto: chi sta a casa cinque giorni su sette perde
le ore del contratto, non i turni che nessuno aveva ancora scritto. È la regola
meno intuitiva dell'app, spiegata per esteso in [04-regole.md](04-regole.md).

**Il dipendente guarda la giornata, non la giudica; e i nomi si cercano** —
`e3ddbd6`

**Come si pubblica, e cosa controllare prima di farlo** — `5137849`
La sezione «Pubblicare» del README, con l'avvertimento sulla password
dell'amministratore.

**Nessuna password nel codice, in vista della pubblicazione** — `811e038`
Gli script di prova perdono le password di ripiego: arrivano da fuori, perché
una password nel codice finisce su GitHub e da lì non si toglie più.

**Salvare il proprio profilo non falliva per il ruolo: falliva e basta** —
`07f0bd6`

**Il lettore regge il foglio vero: le intestazioni sono celle unite** —
`d956c3d`
Il parser Excel messo alla prova su un tabellone reale.

**Una persona può lavorare in più reparti, uno per turno** — `bce2e29` ·
migrazione `08`
Nasce `profile_departments`; `profiles.department_id` diventa il reparto
*principale*. E la vista `reparto_piu_frequente`: la proposta di partenza la
danno i turni già fatti, non una preferenza dichiarata.

**Una persona può stare in squadra senza avere un accesso** — `87fff25` ·
migrazione `07`
Il cambio strutturale più grosso: `profiles.id` si stacca da `auth.users`,
nasce `user_id` nullabile e con lui `current_profile_id()`. Su un tabellone da
trenta persone, pretendere trenta indirizzi email prima del primo turno era un
ostacolo senza ragione.

**Prospetto senza i due riquadri inutili, e l'admin crea account nelle
aziende** — `37fd5d1`

**Prospetto: una tabella sola, con una colonna per causale di assenza** —
`9770d17`

**Prospetto: torna quello a tabelle, la riorganizzazione non serviva** —
`4ace0d1`

**La riorganizzazione va nel Prospetto, non nella Supervisione** — `255279f`

**Tutta l'app: turni, importazione, supervisione, assenze, prospetto** —
`1c5bbc2`
Il commit che porta l'app da schema nudo a prodotto: migrazioni `03`–`06`,
tutte le pagine, i motori di copertura e prospetto, il lettore Excel.

## 15 agosto 2026

**Initial commit from Create Next App** — `69cd399`
Le migrazioni `01`–`02` (schema, RLS, amministratori, password provvisorie)
sono di questa fase.

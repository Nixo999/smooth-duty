# Diario

Cosa è cambiato, quando, e **perché**. Il documento da leggere per primo dopo
un cambio di chat o una pausa: dice dove si era arrivati.

**Regola: dopo ogni pezzo finito, una voce qui.** Una riga, in cima alla
giornata giusta, con il perché. Le voci fino al 25 agosto 2026 sono state
ricostruite dalla storia dei commit.

---

## 2 settembre 2026

**Le cose che se ne vanno adesso se ne vanno, e `motion` entra dopo un mese in panchina**
Chiesto da Nicola: micro-animazioni veloci, interfaccia fluida, usando le
librerie già a disposizione. La libreria a disposizione era una: `motion`,
in `package.json` dal commit «Tutta l'app» e **mai importata**. Il
vocabolario CSS invece c'era ed era buono — una curva, dosi piccole,
`prefers-reduced-motion` globale — ma aveva un buco: **solo entrate**.
Modali e tendine sparivano di colpo, e lo scatto si notava proprio perché
l'ingresso era morbido. Aggiunte le tre uscite (`fade-out`, `sheet-down`,
`pop-out`), più corte e con la curva dell'uscita di pagina, e agganciate
ai `data-[state=closed]` di Radix sul modale e sulle cinque tendine
dell'app. I `<details>` prendono `.dettagli`: il contenuto entra con `rise`
invece di apparire intero.

`motion` entra in versione piccola — `LazyMotion` con `domAnimation`,
`strict`, `MotionConfig reducedMotion="user"` — dal provider `Movimento` nel
guscio, e solo dove il CSS non arriva: la pastiglia di salvataggio delle
Impostazioni ha una presenza vera (entra, cambia stato rientrando, **esce**),
e le ore lavorate del Prospetto scorrono dal valore vecchio al nuovo quando
si cambia periodo, con una corsa interrompibile — tre frecce di fila danno
un numero che insegue l'ultimo tocco, non tre conti in coda. Le barre del
Prospetto animano la larghezza in CSS. La levetta delle Impostazioni si
muove col `transform` invece che col `left`.

Regola scritta in [05-convenzioni.md](05-convenzioni.md): CSS prima,
`motion` solo per uscite e numeri, sempre `m.*`.

**Poi `/simplify`, quattro revisori in parallelo**, e sei cose rifatte
prima del commit: il provider stava dentro il foglio che cambia a ogni
pagina (smontato a ogni navigazione, e cieco alle tendine del guscio) →
alla radice di `AppShell`, e `domMin` al posto di `domAnimation` perché
nell'app non c'è un `whileHover`; `NumeroOre` faceva un `setState` a ogni
frame → il valore vive in un `MotionValue` e `m.span` scrive il testo da
solo, e la corsa parte da quello che c'è a schermo; la curva era scritta a
mano in sette punti del CSS e in due file TS → `--curva-entrata` /
`--curva-uscita` in `:root`, e `CURVA_*` esportate dal provider; le utility
`transition-*` di Tailwind giravano sulla curva di Tailwind → ridefiniti i
default nel `@theme`; `.dettagli` era una classe che cinque `<details>` su
cinque avevano → regola sull'elemento; la stringa della tendina era in
cinque file → `TENDINA` in `lib/utils.ts`, come `BARRA_AZIONI`. Più la
freccia dei richiudibili, che era scritta due volte, in `ui/freccia.tsx`.
Non fatto, dichiarato: un wrapper vero della tendina (Root/Trigger/Item),
perché tocca otto siti fuori dal diff.

⚠️ Sul Mac di Patrick non c'è nessuno dei plugin del PC di Nicola
(superdesign, playground, modern-web-guidance, ponytail, deep-research):
sono locali a quella macchina, come dice la nota del vault. La «pulizia del
codice» qui è passata da tsc, eslint, `npm run prove` e dal `/simplify` di
Claude Code sul diff.

---

**Il Prospetto apriva su due numeri negativi senza denominatore**
Chiesto da Nicola: riprogettare la pagina per impatto visivo e coerenza. Il
difetto vero non era estetico. La pagina cominciava con «perse 96h» e
«scoperti 12h» e nessun modo di sapere se 96 ore su quel mese fossero tante:
mancava il denominatore. Adesso il numero grosso è **quanto si è lavorato**,
sotto c'è una barra a due segmenti — lavorate / perse — e i due numeri **da
coprire** stanno accanto in due riquadri, che è quello che sono: cose da
fare, non misure del periodo. Sotto ogni nome, nella tabella, la stessa barra
in piccolo: chi ha perso più ore si vede senza leggere una cifra.

⚠️ **Riaperta mezza decisione del 30 agosto.** Le ore effettive erano state
tolte dalla sintesi perché «già sotto ogni nome»: un totale di periodo però
non è la stessa informazione di una riga per persona, ed era proprio il
denominatore che mancava. Le ore *attese* restano fuori, e per la ragione di
allora: su un anno confrontano un contratto intero con un tabellone fatto per
due settimane.

**Nessun colore nuovo.** `--turno` per le ore lavorate — in quest'app quel blu
vuol dire «turno» da sempre — e `--warning` per le perse, che è la tinta che
la tabella dava già alle assenze. La coppia è passata dal validatore del
skill `dataviz`: separazione CVD ΔE 23,6 in chiaro e 30,2 in scuro, contrasto
sul fondo oltre 3:1 in tutti e due. I due FAIL che restano sono sulle bande di
luminosità e croma della tavolozza di riferimento del validatore, non sulla
leggibilità, e non si correggono inventando tinte fuori dai token. Come vuole
lo stesso skill, l'identità non è mai solo colore: etichetta col valore
accanto a ogni segmento, 2 px di stacco fra i segmenti, icona oltre alla
tinta sui riquadri che allarmano.

Il resto è coerenza con le Impostazioni: testata con icona nel quadrato
`accent-soft`, periodo in pastiglia con `aria-live`, un `<h1>` che prima non
c'era, la scheda della tabella con la sua intestazione e la riga lunga sul
conto delle assenze diventata un richiudibile.

⚠️ Il motore (`lib/prospetto.ts`) non è stato toccato, e la pagina non è
stata guardata in un browser: prove e build passano.

---

**La testata non doveva restare incollata: doveva sparire scorrendo**
Terzo giro sulla stessa richiesta, e i primi due erano sbagliati nella stessa
direzione: «deve rimanere fissa» l'avevo letto come «inchiodata allo
schermo», e voleva dire «sta in cima alla pagina e quando scendo se ne va».
Tolto lo `sticky`, tolto `glass`, tolti i margini negativi: la testata è un
blocco normale in cima. Restano l'icona, la pastiglia dell'azienda e quella
del salvataggio, che erano la parte che andava bene.

Resta scritto in [03-pagine.md](03-pagine.md) il pezzo che vale comunque: se
un giorno qualcosa dentro una pagina torna `sticky`, si misura da `top-0` e
non da `top-14`, perché a scorrere è il `<main>` del guscio e non la finestra.

---

**«Fermo» vuol dire identico, non «si accorcia con grazia»**
La testata che si rimpiccioliva da staccata era una bella idea e la risposta
sbagliata: Nicola ha ripetuto la stessa richiesta due volte — il blocco
titolo + azienda + riga di spiegazione deve stare fermo in cima — e una
testata che si accorcia mentre scorri è, dal suo lato dello schermo,
esattamente il blocco che si muove. Fuori l'`IntersectionObserver`, fuori la
sentinella, fuori la transizione: `glass` sempre acceso, imbottitura fissa,
niente cambia. Meno codice di prima.

⚠️ Il costo, dichiarato: sul telefono la barra occupa ~74 px per sempre,
sotto ai 56 della topbar. Se dà fastidio si nasconde la riga di spiegazione
sotto `sm`, ma è una scelta di prodotto, non una riga da mettere di mia
iniziativa.

---

**La testata delle Impostazioni si incollava 56 px troppo in basso**
Chiesto da Nicola: la testata deve restare fissa ed essere più bella.
Restando fissa non lo era davvero — `lg:sticky lg:top-14` partiva dal
presupposto che a scorrere fosse la finestra, e **a scorrere è il `<main>`
del guscio**, che ha `overflow-y-auto`. Lo `sticky` si misura dal bordo alto
di quell'area, che sta già sotto la topbar: quei 56 px erano un buco in cui
il contenuto passava scoperto. Adesso `top-0`, e fissa a **ogni** larghezza,
non solo da `lg`.

Da staccata la testata si accorcia: resta titolo, nome dell'azienda e stato
del salvataggio, sparisce la riga che spiega cosa sono queste impostazioni —
serve a chi arriva, non a chi sta già scorrendo, e su un telefono una barra
fissa a due righe si mangia un sesto dello schermo per sempre. Lo stacco lo
riconosce un `IntersectionObserver` su una sentinella di un pixel: con un
evento di scorrimento avrei dovuto sapere quale nodo scorre, che è
esattamente il dettaglio su cui la versione di prima aveva sbagliato.

Il fondo è `glass`, lo stesso della topbar, e **compare solo da staccata**:
il guscio disegna dietro le pagine una sfumatura con due aloni, e un
`bg-canvas` piatto ci si vedeva sopra come una toppa. Sull'estetica: icona in
un quadrato `accent-soft` come nelle intestazioni delle sezioni, il nome
dell'azienda in una pastiglia invece che dentro le virgolette basse, e lo
stato del salvataggio diventa una pastiglia con un pallino — colore *e*
forma, perché il verde e il rosso non li distinguono tutti. «Modifica non
salvata» si accorcia in «Non salvato»: sta in una pastiglia, non in una riga.

---

**Secondo giro sulle Impostazioni: le colonne si pareggiano, le frasi si sciolgono**
Il primo taglio (sopra) reggeva alla lettura e non alla misura: «a sinistra
cosa esiste, a destra cosa succede quando muovi un turno» metteva le due
sezioni più alte una sopra l'altra e lasciava la colonna destra **450 px più
lunga**. L'asse adesso è un altro e regge lo stesso — a sinistra l'app e la
settimana (*Moduli attivi*, *Pubblicazione e modifiche*), a destra le persone
(*Cosa vedono e cosa chiedono i dipendenti*, *Turni nuovi e lavoro a
chiamata*) — e le due colonne finiscono alla stessa altezza. **L'ordine delle
sezioni è una misura, non un ragionamento**: chi ne sposta una rimisuri.

Le spaziature crescono solo da `lg`, dove lo spazio c'è: righe `lg:py-4`,
schede `lg:px-5`, intestazioni `lg:py-3.5`, e un `lg:border-b` sotto la testata
appiccicata — senza, le schede che le passano dietro sembravano toccarla. Sul
telefono non cambia un pixel.

Sui testi: tecnico non vuol dire contorto, e il primo giro aveva sbagliato nel
verso opposto a quello di prima. Le nominalizzazioni sono tornate verbi — «la
persona può rifiutare un turno che la porta oltre le ore del contratto» al
posto di «un turno oltre le ore contrattuali diventa rifiutabile» — e sono
sparite le parole da ufficio: «tipologie di assenza», «a parità di giorno e
orario», «riceve una richiesta unica», «regime di ingaggio». Le tre opzioni di
chi lavora a chiamata tornano a dirsi con un verbo («Segna i giorni in cui non
può»), che si capisce prima di «Indisponibilità dichiarata». `disattivato`
torna **spento**, che è la parola che l'app usa già altrove, e `In caso di
rifiuto` diventa **Se rifiuta**.

⚠️ Sempre non verificato in un browser: prove e build passano, la pagina no.

---

**Le Impostazioni smettono di essere un nastro verticale, e smettono di dare del tu**
Due difetti che erano lo stesso difetto: la pagina era scritta come se
esistesse solo il telefono. Il guscio dà fino a `max-w-[100rem]` e qui se ne
usavano `max-w-2xl` — su un monitor sono 672 px di colonna, nove schede in
fila e novecento pixel di niente a destra, con il salvataggio automatico
annunciato a tre schermate dalla leva appena toccata.

**Da 1024 px le schede stanno su due colonne.** `lg:` e non `md:`: a 768 le
colonne stanno a ~350 px e la descrizione va a quattro righe per far passare
la levetta da 44. `lg:max-w-6xl` e non oltre, o le descrizioni superano i 90
caratteri e si legge peggio di prima. Due wrapper di colonna e non otto figli
diretti dentro `grid-cols-2`: così l'ordine del DOM resta quello di lettura
sul telefono, il Tab scorre per colonne, e aprire un `<details>` allunga solo
la sua colonna — con `items-start`, o le due si stirano e il richiudibile
aperto lascia un vuoto nell'altra. **Sotto i 1024 px non cambia niente.**

**Le sei aggregazioni «per gesto» diventano quattro per ambito**: Moduli
attivi · Visibilità e richieste del personale · Pubblicazione e modifiche ·
Nuovi turni e personale a chiamata. Il gesto non è sparito, è sceso di un
livello: sta nella riga «Quando scatta». Sei intestazioni che cominciavano
tutte per «Quando» erano un indice inutile su una colonna, e su due sarebbero
state sei volte la stessa parola nella stessa schermata. `Gesto` diventa
`Sezione` col titolo in `<h2>` e `aria-labelledby`, `Pagina` diventa
`Modulo`.

**Il registro dei testi cambia**, e questo riapre la scelta del 30 agosto.
Erano scritti «per chi gestisce un negozio», con la confidenza che ne segue
(«chi ti può dire di no», «l'app non serve a niente»). Adesso l'etichetta è
un sostantivo — «Accettazione dei turni in straordinario», non «Straordinari
da accettare» — la descrizione dice cosa cambia in azienda, e la
rassicurazione è un fatto: «il turno resta valido», non «va bene». Chi legge
sta decidendo, non imparando. Fuori anche `non in uso` → **Disattivato**,
`Se dice no` → **In caso di rifiuto**, e un'etichetta nuova **Esito** per i
regimi a chiamata, dove l'app blocca il salvataggio invece di far rifiutare:
lì «se dice no» descriveva una cosa che non succede.

**Un guasto del salvataggio adesso resta scritto.** Prima era un toast che
passava e una levetta che tornava indietro da sola; su due colonne quella
levetta può stare nella metà di schermo che non si sta guardando. Lo stato
`errore` tiene «Modifica non salvata» finché un salvataggio nuovo non riesce.

Trovato di striscio: il sottotitolo diceva «Tre si possono spegnere» sopra a
quattro moduli, e `docs/03-pagine.md` conta undici impostazioni quando in
`lib/impostazioni.ts` sono dodici — `pagina_disponibilita` è arrivata dopo
tutti e due. Corretto il primo, aggiornato il secondo.

⚠️ **Non verificato su schermo**: `npm run prove` e `npm run build` passano e
le utility Tailwind sono nel CSS costruito, ma la pagina non è stata guardata
da un browser. E resta aperta la domanda del 29 agosto — turno rifiutato:
eliminato o scoperto? I due «In caso di rifiuto» della quarta sezione dicono
*eliminato*, che è il comportamento di oggi.

---

## 1 settembre 2026

**Le pagine si cambiano col dito, e il dito dice dove sta andando prima di mollare**
Su OperO il gesto c'era già e a Nicola serviva qui, fatto meglio. La parte
uguale è quella giusta e si riusa: il foglio segue il dito, agli estremi
trova resistenza invece del vuoto, e al rilascio o si è andati abbastanza in
là (28% di schermo) o si è dato un colpo secco (0.45 px/ms in meno di mezzo
secondo) — se no si torna al proprio posto.

Le tre cose che qui sono diverse:

**Le soglie stanno in un motore puro** (`lib/scorrimento.ts`), provato da
`npm run prove` con 26 controlli. Un gesto si sbaglia di poco — la soglia
bassa cambia pagina a chi scorre un elenco, quella alta fa sembrare l'app
rotta — e il posto peggiore per accorgersene è il telefono in mano. Il caso
che vale da solo la prova: **a 45 gradi vince lo scorrimento**, perché chi
legge un elenco lungo la mano la porta anche di lato.

**Il gesto si prende solo se non è di qualcun altro.** Prima di partire si
risale l'albero dal punto toccato: se si è dentro qualcosa che scorre in
orizzontale (la striscia dei giorni, le tabelle di prospetto, supervisione e
disponibilità), dentro una barra trascinabile della supervisione
(`touch-action: none`), dentro un campo di testo o sotto
`data-scorrimento="no"`, il dito è suo e la pagina sta ferma. Fuori dalle
pagine della barra il gesto non esiste proprio: da `/turni/importa` un dito di
traverso butterebbe via l'anteprima di un foglio appena caricato. E i 24px ai
bordi dello schermo restano del sistema — lì si torna indietro nel browser, e
contendere quel gesto non lo vince, lo rompe.

**La destinazione si accende nella barra mentre il dito è ancora giù**: la
voce che si sta lasciando si spegne, quella dove si sta andando diventa
grigio-testo appena il gesto è deciso e **accento** appena si è passata la
soglia. È l'unica parte di interfaccia nuova, e non è decorazione: dice
«mollando adesso arrivi qui» finché si è ancora in tempo a tornare indietro.

⚠️ **Il passaggio non è un movimento solo, e non poteva esserlo.** Su OperO
la pagina nuova è un cambio di componente e la si anima con una View
Transition; qui ogni pagina è un giro fino al server (Ohio + Irlanda), quindi
l'uscita parte col rilascio e l'ingresso quando la pagina arriva — e chi entra
può essere il segnaposto di `loading.tsx`. Per questo l'uscita è piena
(-100% e dissolvenza) e **l'ingresso è 32px più una dissolvenza**, la stessa
dose del resto dell'app: uno scorrimento lungo giocato in ritardo si vede che
è in ritardo. Le pagine non si pre-caricano a mano: le voci della barra sono
`<Link>` in vista e Next le prende già in anticipo, e `staleTimes.dynamic: 30`
fa il resto.

Un pezzo di codice esistente è cambiato: il **tiro-giù per ricaricare**
non mollava mai la presa. Parte dallo stesso dito e a schermo in cima si
contendevano i primi pixel, quindi un trascinamento di lato appena inclinato
faceva scendere anche il marchio del ricaricamento. Adesso chi decide per
primo si tiene il gesto.

Verificato in browser con eventi di tocco sintetici su un banco di prova
temporaneo (tre pagine finte dentro `AppShell`, poi cancellate): il foglio
segue il dito, la resistenza ai bordi c'è (50px di dito → 14px di pagina), il
corto e lento torna indietro, il lungo passa, l'anteprima nella barra si
accende alle due soglie, l'ingresso arriva dal lato giusto e si ripulisce, la
striscia dei giorni e i bordi dello schermo non lo fanno partire, e il
tiro-giù continua a funzionare da solo. ⚠️ **Non provato su un telefono
vero**: il dito vero ha una precisione e una velocità che gli eventi
sintetici non hanno, e le soglie potrebbero volere una limata.

Database: **niente**. Solo interfaccia.

## 31 agosto 2026

**All'apertura dell'app manca ancora un confine: eccolo**
Patrick chiedeva la stessa cosa della voce qui sotto — *«il logo che gira anche
quando carichi l'app, non solo quando cambi pagina»* — ed è arrivata per un'altra
strada mentre ci lavoravo. Resta però un buco che i due `loading.tsx` di gruppo
non possono chiudere, e la voce qui sotto dà per coperto: **il primo arrivo.**

Il motivo è dove vive un confine di Suspense. `loading.tsx` avvolge i *figli*
del suo segmento, quindi sta **dentro** il layout. All'apertura è il layout
stesso ad aspettare: `(app)/layout.tsx` è `async` e prima di restituire una
riga di JSX legge l'utente da Supabase, le impostazioni dell'azienda e i tre
contatori del pallino su «Oggi». Finché quel `await` non torna, il confine
dentro `(app)` non esiste ancora — quindi non può mostrare niente, e si vede
il fondo vuoto.

Il file nuovo è `src/app/loading.tsx`, un livello sopra il layout, e riusa
`CaricamentoMarchio` così com'è: a tutto schermo, che qui è esatto perché
un'intestazione da lasciar vedere non c'è ancora. **Fra una pagina e l'altra
non cambia niente**: vince sempre il confine più vicino, cioè quello dentro
`(app)`.

⚠️ Non copre il bianco che nell'APK precede il **primo byte**, quando la
webview non ha ancora l'HTML: lì non arriva nessun `loading.tsx`. Quel pezzo è
lo splash nativo di Android (`values/styles.xml`), oggi un'icona ferma.

Database: **niente**. Solo interfaccia.

**Nell'attesa il calendario sta fermo e gira solo l'anello, anche fra le pagine**
Richiesta di Nicola: durante ogni caricamento il logo al centro, col
calendario immobile e il cerchio che orbita. L'anello del marchio ora vive in
un gruppo suo (`.marchio-anello` in `marchio.tsx`) e la classe
`marchio-girante` lo fa ruotare da solo — `transform-box: fill-box` perché il
gruppo genitore è capovolto e senza origine propria l'anello orbiterebbe
fuori dal disegno, `reverse` perché nello spazio specchiato la rotazione
positiva appare all'indietro. I due `loading.tsx` (gruppi app e admin)
abbandonano gli scheletri per il marchio centrato: un'attesa sola, uguale
per la navigazione, il primo arrivo, il tiro del tabellone e la versione
nuova. Misurato nel browser: rotazione lineare oraria, centro fisso, gruppo
del calendario senza animazione. Non verificato: il loading montato dentro
la shell (serve un accesso) — si guarda su denkishift.it navigando.

**L'attesa ha la faccia dell'app, e l'icona sulla home smette di essere rotta**
Tre pezzi chiesti da Nicola. Tirando giù il tabellone dal bordo alto il
marchio scende col dito, ruota, e oltre la soglia l'app si ricarica per
intero con il marchio che gira a tutto schermo (`caricamento-marchio.tsx`;
`overscroll-y-contain` tiene fuori la spia del browser, che sarebbe stata la
seconda per lo stesso gesto). Lo stesso schermo compare quando esce una
versione nuova: ogni build stampa un timbro in `NEXT_PUBLIC_VERSIONE`
(next.config), `/versione` lo dice al mondo con `no-store`, e
`controllo-versione.tsx` confronta al ritorno in primo piano e ogni cinque
minuti — se differiscono, marchio e ricarica, con la memoria per-sessione
che impedisce il giro infinito se una cache mente. E l'icona della home:
la 180 di iOS aveva il marchio schiacciato nel quadrante in alto a sinistra
con mezza icona vuota. Rigenerate tutte e cinque dal vettore vero di
`marchio.tsx` — rasterizzato nel browser, che è l'unico renderer SVG di
casa — con le maskable dedicate (logo al 56%%, dentro la zona che Android
non ritaglia) e `?v=2` su manifest e meta perché iOS e Android tengono la
vecchia icona in cache per indirizzo. Cache del service worker a `turni-v2`
per lo stesso motivo. Non verificato: il tiro e l'aggiornamento forzato non
sono stati provati su un telefono vero, e l'icona nuova sulla home si vede
solo reinstallando l'app.

## 30 agosto 2026

**La Disponibilità diventa una scelta, e la Supervisione smette di mostrare i fantasmi**
Due richieste di Nicola. La pagina Disponibilità ora si spegne dalle
Impostazioni come le altre tre (`pagina_disponibilita`, migrazione `20`,
default acceso): sparisce dal menu del dipendente e si rifiuta di aprirsi,
ma le dichiarazioni restano e il responsabile continua a gestirle dal
tabellone — si spegne la porta, non il calendario, e il regime di ingaggio
vale lo stesso. In Supervisione gli assenti non si disegnano più: la barra
sbiadita «assente, non conta» occupava la corsia senza contare nella
copertura, che è l'unica domanda della pagina. Migrazione eseguita sullo
sviluppo; produzione da eseguire prima del push.

**«Oggi» e' vissuta un giorno**
Tolta da Nicola: per adesso non serve, e il tabellone resta la casa. Con lei
se ne vanno la voce di menu col distintivo delle cose da decidere — e le tre
query che il guscio pagava a ogni carico per contarle — il motore
`lib/oggi.ts`, la sua prova, e la sezione nei docs. Il registro dei punti che
usano `siLavoreraDavvero` scende da otto a sei. Tutto recuperabile dalla
storia di git, niente rami morti nel codice.

**Il marchio vero al posto dell'icona di ripiego**
Patrick ha passato il logo di DenkiShift in PDF (Affinity, «Presentazione logo
alternativa»): l'anello spezzato con le due saette, metà neutro e metà sfumato,
col calendario al centro. Fino a ieri al suo posto c'era un quadretto sfumato
con dentro l'icona `CalendarDays` di lucide — un segnaposto.

**È stato estratto come vettore, non ridisegnato e non rasterizzato.** Il PDF
non conteneva nessuna immagine: solo tracciati, una sfumatura assiale e un Form
XObject per il calendario. Da lì escono 34 percorsi, che sono i tracciati veri
di Affinity. Il nuovo componente è `components/ui/marchio.tsx`.

Due cose lo rendono usabile ovunque, e non solo sul nero per cui era disegnato:
- la metà neutra e il corpo del calendario usano `currentColor`, quindi prendono
  il colore del testo intorno. Sul tema scuro il risultato è **identico
  all'originale**; sul chiaro è il suo negativo. Senza questo, su fondo bianco
  sparirebbe metà marchio;
- la metà sfumata legge `--marchio-1` / `--marchio-2`, che da oggi sono la
  **sorgente unica** da cui scende anche `--brand-gradient`.

I colori sono quelli del sito, non quelli del PDF. Il file originale è in CMYK
e su schermo darebbe `#626095 → #ab4287`, una coppia più spenta che non
coinciderebbe con nient'altro nell'app — sono gli stessi due colori del
marchio, smorzati dalla conversione per la stampa.

⚠️ **La trappola, per chi rifarà questo lavoro.** Con
`gradientUnits="userSpaceOnUse"` l'asse del gradiente si legge nello spazio
utente **dell'elemento che usa il gradiente** — cioè dentro al gruppo che
capovolge la Y, non fuori. Avendo messo le coordinate già capovolte, l'asse
finiva fuori dal disegno e la sfumatura usciva **piatta**: un colore solo, senza
errori e senza avvisi. Va con le coordinate PDF originali.

Rifatte anche le tre icone PWA (180, 192, 512): marchio sul nero `#09090B` del
sito, dentro al 62% del lato perché la 512 è dichiarata anche `maskable` e fuori
dall'80% centrale il sistema taglia. Sparisce la classe `.marchio`, che non
serve più.

✅ Verificato a 28, 32, 40, 64 e 110px su tutti e due i temi: a 28px — la misura
della barra in alto — anello, saette e calendario si distinguono ancora.
⚠️ Dentro l'app no, è dietro login.

**Il turno nel tabellone non è l'accento, e lo sfondo è quello del sito**
Due richieste di Patrick sullo stesso giro. La prima: «i turni lasciali
azzurri». Aveva ragione, e la ragione è più forte di così — nel tabellone
(`roster.tsx`, il `Chip`) ogni turno assegnato era `bg-accent-soft text-accent`,
quindi seguiva l'accento ovunque fosse andato. Ma la regola scritta due voci
più sotto dice che **l'accento è azione e selezione, mai uno stato**: un turno
non è né l'una né l'altra, è la cosa che il tabellone mostra. Finché
condividevano il token, quella regola era scritta e non applicata.

Adesso il turno ha `--turno` / `--turno-soft`, fissi sull'azzurro `#0057AD`
(chiaro) e `#3D9EFF` (scuro). Il chiaro è mezzo passo più scuro dell'azzurro di
prima: sui grigi viola nuovi, `#005BB7` sulla propria pastiglia stava a 4,49 —
sotto soglia per due centesimi. Il turno non assegnato resta oro, gli anelli di
conferma restano arancio/verde/rosso.

**Lo sfondo di `denkicode.com` è entrato nell'app**, portato dal sito misurato
e non a memoria: la sfumatura verticale (`--gradient-hero`), due aloni viola
radiali ai fianchi e i fili sottili inclinati fra una sezione e l'altra. Sul
tema scuro le dosi sono quelle del sito senza sconti (alone a 0,16); sul chiaro
sono dimezzate, perché le stesse dosi su un foglio chiaro sporcano invece di
dare profondità.

Tre scelte di costruzione che vale la pena non riscoprire:
1. **Il fondo è passato da `<body>` a `<html>`.** Il livello d'ambiente è un
   `::before` di `<body>` a `z-index: -1`, e così ci finisce sopra con
   certezza invece di dipendere da quale dei due elementi propaga il proprio
   sfondo alla pagina.
2. **È fisso, non scorre.** Il tabellone si scorre per ore: uno sfondo che
   scivola col contenuto dà il mal di mare.
3. **Non costa leggibilità.** Le schede sono `--surface` pieno e opaco:
   l'ambiente si vede solo nei margini fra una scheda e l'altra, e nessun testo
   dell'app gli finisce sopra. I contrasti misurati restano quelli.

⚠️ La prima versione della sfumatura chiara aveva la tappa di mezzo più scura
dei due estremi e si vedeva **la gobba a metà schermo**. Va tenuta monotona.
Verificato a 375px e a schermo largo, tutti e due i temi, su una riproduzione
fedele fuori dall'app: dentro l'app non si è potuto guardare, è dietro login.

**L'azzurro di iOS non era un colore nostro: l'app passa al viola del marchio**
Poche ore dopo la revisione dei contrasti qui sotto, e costruita sopra quella,
non al posto suo. `--accent` va da `#005BB7` a `#802ACB` sul chiaro e da
`#3D9EFF` a `#BC79F6` sullo scuro. La ragione non è estetica: l'azzurro di
sistema è il colore che hanno tutte le applicazioni, comprese quelle contro cui
DenkiShift si vende, e un tabellone che finisce in uno screenshot commerciale
deve essere riconoscibile.

Il viola sta alla tinta **272**, che è il punto di mezzo esatto fra i due soli
colori del marchio (viola `#695CA5`, magenta `#C23C8E`, fermi dal 13 maggio).
Il fondo scuro è il `#09090B` di `denkicode.com` preso tale e quale, e l'oro
del sito `#EBC247` diventa `--warning` sul tema scuro: un colore di marchio che
nell'app non ha un mestiere diventa decorazione.

Il pezzo che fa il lavoro non è l'accento ma **i grigi**, che portano la stessa
tinta 272 a saturazione 9-18%. Un accento nuovo sopra grigi azzurri resta un
bottone diverso; con i neutri intonati l'app si legge come una cosa sola. Il
magenta esiste come `--brand-2` ma **non entra nelle pagine operative**: alla
tinta 322 è troppo vicino al rosso di `--danger`, e un colore che somiglia a un
allarme senza esserlo è un difetto. Sta nel contratto dei significati, riga
propria, accanto agli altri quattro.

**Il metodo dei contrasti è quello di qui sotto, non uno nuovo.** Ogni colore è
stato ricalcolato con le due misure già stabilite — fondo più sfavorevole
(`--surface-3`) e forma tenue composta sopra quel fondo — e **tutti e otto
passano 4,5 su entrambe, in tutti e due i temi**. Regge anche il conto che
aveva imposto `--accent-fg` scuro: nemmeno in viola esiste un tono insieme
leggibile come testo su fondo nero e abbastanza scuro da reggere il bianco
sopra, quindi il primo piano del bottone pieno resta il nero della pagina.

⚠️ **Le tinte dei reparti hanno perso la fascia 260-285**, che è quella
dell'accento: un reparto colorato lì sembrava il reparto selezionato, e
l'anello di selezione — che è color accento — sopra quel pastello non si vede.
`TINTE` passa da 26 a 24 valori, `TINTE_RIGHE` sostituisce 270 con 289. Chi ha
già un reparto su quelle tinte se lo ritrova invariato nel database: il valore
salvato non viene toccato, cambia solo cosa si può scegliere da qui in avanti.

Nessuna migrazione, nessun tocco al database: è colore, viaggia col codice.

**La pagina che spiegava troppo, e la barra che faceva cinque mestieri**
Nicola: «le impostazioni sono diventate difficili da usare», e il conteggio
gli dava ragione — 2.700 parole per dieci controlli, quattro blocchi di testo
a levetta, un «Salva» a tre schermate dalla leva toccata. Adesso a vista resta
una riga per controllo («Come funziona» tiene il resto, per chi sta
decidendo), ogni modifica si salva da sola con mezzo secondo di respiro, e le
tre pagine spegnibili stanno in una scheda propria in testa: accendere una
pagina non e' una regola di conferma. Sul tabellone: i tre filtri che al
riposo dicevano «qualsiasi» tre volte stanno dietro un bottone «Filtri» col
conto degli attivi; Annulla, Ripeti e Svuota esistono solo quando si puo'
scrivere, e il cestino dell'intera settimana ha perso il posto fisso in barra
e guadagnato l'etichetta. Nel guscio il pallino ambra da 6px e' diventato il
numero scritto, e l'iniziale ha la freccia che dichiara il menu. Non
verificato a schermo: tutto dietro il login.

**Perche' l'app e' lenta: misurato, e il database e' innocente**
Statici a 832-1187ms l'uno alla prima visita e 21ms alla seconda (cache di
bordo fredda), /login a 458-633ms freddo e 223ms caldo (funzioni in Ohio,
database in Irlanda — spostare la regione su Netlify e' a pagamento), query
del tabellone sotto RLS a 3,7ms con piano ottimale: il tempo si perde in
viaggio, non nel database ne' nel codice. Tre contromisure a costo zero:
`netlify/functions/tienila-sveglia.mjs` fa una richiesta a /login ogni cinque
minuti cosi' nessun click paga l'avvio a freddo; `staleTimes: 30` in
next.config riusa per mezzo minuto le pagine appena viste — accettabile
perche' tutte le 70 scritture passano da `revalidatePath`, verificato — e il
service worker gia' copriva gli statici con cache-first, al contrario di
quanto pensavamo: alla seconda apertura quel costo non c'e' gia' piu'.

---

## 28 agosto 2026

**`denkishift.it` è online, e la voce sparisce da «non c'è ancora»**
Era in elenco da quando l'elenco esiste: «l'app gira in locale e sull'APK di
prova puntato alla rete di casa». Adesso il sito c'è, risponde, e la pagina di
accesso carica. Resta il resto del blocco commerciale — SMTP proprio, notifiche
fuori dall'app, store — ma il pezzo che teneva ferma la demo non c'è più.

**Non si avvia più niente in locale: si guarda su `denkishift.it`**
Deciso da Nicola. L'app è online, e quello è il posto in cui vive davvero:
stessa build, stessa latenza verso il database, service worker vero, telefono
vero. Le tre cose che in locale non si sono mai viste — regione delle funzioni,
PWA installata, rete lenta — lì si vedono da sole.

La conseguenza va scritta accanto alla decisione, o fra un mese sembrerà solo
una comodità: **si verifica dopo aver pubblicato**, e quello che finisce su
`main` lo vede la squadra di un cliente. Da qui due cose che erano buone
abitudini diventano l'unica rete: `prove` e `build` prima di ogni push, e la
migrazione sul database di **produzione** prima del push, non dopo — è un
progetto Supabase suo, `.env.local` e `.env.db` non ci arrivano, e un deploy
porta il codice ma non lo schema. `npm run dev` e `.claude/launch.json` restano
per il caso raro (nessuna rete, log del server da leggere): non sono stati
tolti, non sono più il giro normale.

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

## 28 agosto 2026

**`pg` non era dichiarato, e fermava proprio chi tocca il database**
`esegui-sql.mjs` e `lib-db.mjs` importano `pg`, ma il pacchetto stava in
`node_modules` solo perché qualcuno lo aveva installato a mano con `--no-save`:
`npm ls` lo dava `extraneous`. Bastava rifare `node_modules` per perderlo. Su
una macchina appena installata il comando
per applicare una modifica allo schema rispondeva `Cannot find package 'pg'`,
che sembra un problema di credenziali e manda a cercare nel posto sbagliato.
Adesso sta in `devDependencies`, e non fra le dipendenze vere perché l'app non
lo importa mai: lo usano solo gli script.

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

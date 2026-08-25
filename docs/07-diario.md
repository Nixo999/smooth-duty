# Diario

Cosa è cambiato, quando, e **perché**. Il documento da leggere per primo dopo
un cambio di chat o una pausa: dice dove si era arrivati.

**Regola: dopo ogni pezzo finito, una voce qui.** Una riga, in cima alla
giornata giusta, con il perché. Le voci fino al 25 agosto 2026 sono state
ricostruite dalla storia dei commit.

---

## 26 agosto 2026

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

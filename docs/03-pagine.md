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
l'assenza in corso col motivo, la conferma del rientro, e su un turno
preapprovato i due bottoni di `RispondiTurno` — «va bene» e «non posso», uno
accanto all'altro perché sono la stessa domanda. Le etichette dei motivi stanno
in `MOTIVO_CONFERMA`.

In cima al tabellone del responsabile c'è la casella dei **messaggi**
(`components/turni/messaggi.tsx`): i no dei dipendenti, e cosa ne è seguito.
Aprirli è ciò che fa scattare l'effetto del rifiuto — vedi
[04-regole.md](04-regole.md).

Legge: `profiles` (attivi) · `shifts` della settimana · `departments` ·
`absences` che toccano la settimana · `reparto_piu_frequente` ·
`published_weeks` per quel lunedì. **Al dipendente i turni di una settimana in
bozza non arrivano proprio** (`shifts={inBozza ? [] : shifts}`): una settimana a
metà fa più danni di una dichiaratamente non pronta.

Legge anche i **messaggi aperti**, e non filtrati per settimana: un turno
rifiutato di sabato non deve sparire perché il responsabile sta guardando
lunedì.

Se la lettura dei turni o delle persone **fallisce**, la pagina mostra
`ErroreDati` invece di un tabellone vuoto: vedi
[05-convenzioni.md](05-convenzioni.md).

Azioni: `salvaTurno` · `eliminaTurno` · `eliminaTuttiITurni` ·
`ripristinaTurni` · `copiaTurni` · `anteprimaCopia` · `pubblicaSettimana` ·
`accettaTurno` · `rifiutaTurno` · `apriMessaggi` · `chiudiMessaggio`.

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

Solo capo. Dieci impostazioni raggruppate **per pagina**, come si vedono nella
schermata, tutte descritte in [04-regole.md](04-regole.md): cosa è rifiutabile
sui turni, quali pagine l'azienda usa, chi vede la Supervisione, quali causali
si possono chiedere.

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

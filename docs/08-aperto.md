# Cosa manca, cosa è in dubbio

Il documento delle cose non fatte. Quando una voce viene chiusa, si toglie da
qui e si scrive nel [diario](07-diario.md).

## Recupero password: dov'è arrivato, e cosa manca — 26 agosto 2026

**Fatto**, e verificato interrogando Supabase:

| | Stato |
|---|---|
| **Site URL** = `https://denkishift.it` | ✅ era `http://localhost:3000` |
| **Redirect URLs** contiene `https://denkishift.it/conferma` | ✅ era vuoto |

Prova: il link che Supabase compone adesso rimanda a
`https://denkishift.it/conferma`. Prima, qualunque cosa chiedesse l'app,
ripiegava su `localhost` — ed è per questo che il link della mail apriva una
pagina che non esisteva.

**Manca una cosa sola, e ne blocca un'altra: l'SMTP.**

Oggi le mail partono dal mittente incluso in Supabase. Due conseguenze:

1. **Poche mail all'ora.** Con trenta persone in squadra il tetto si tocca
   subito, e chi resta fuori non riceve niente e non capisce perché.
2. **I modelli non si possono modificare.** Il pannello lo dice esplicitamente
   («Set up custom SMTP to edit templates»): finché si usa il mittente
   incluso, il corpo della mail resta quello predefinito.

Il punto 2 è quello che conta di più, perché tiene fuori la forma
`{{ .TokenHash }}`:

```
{{ .SiteURL }}/conferma?token_hash={{ .TokenHash }}&type=recovery
```

⚠️ **Senza quella forma il link vale solo sul dispositivo da cui è partita la
richiesta.** Il modello predefinito produce uno scambio PKCE, che ha bisogno
del segreto rimasto in quel browser: chiedere il recupero dal computer e aprire
la posta dal telefono — il caso normale per una squadra — non funziona, e
finisce sul login con «quel link non vale più».

Quindi, oggi: il recupero **funziona solo nel browser da cui è partita la
richiesta**. Non è «stesso dispositivo»: è *stesso browser*. Il caso che
inganna di più è il client di posta che apre i link nel browser predefinito
mentre la richiesta era partita da un altro — stesso computer, e non funziona
lo stesso.

Da qui l'app non dice più «quel link non vale più» a chi ci casca: `/conferma`
guarda se il cookie verificatore c'era, e se manca manda al login con
l'istruzione giusta — copia l'indirizzo del link e incollalo in quel browser.
Dire «scaduto» mandava a chiederne un altro, che falliva identico. Per chiudere il cerchio serve un SMTP proprio
(*Project Settings › Authentication › SMTP Settings*), e subito dopo il modello
qui sopra.

## ⚠️ Da eseguire sul database — 28 agosto 2026

**La migrazione `19` non è ancora stata eseguita da nessuna parte.** Il codice
la dà per fatta. Dalla `16` alla `18` sono già sul database di sviluppo.

```bash
node --env-file=.env.local --env-file=.env.db scripts/esegui-sql.mjs supabase/19-lavoratori-a-chiamata.sql
node --env-file=.env.local --env-file=.env.db scripts/verifica-schema.mjs
```

Senza la `19` l'app **non si rompe ma mente**, in tre punti: `company_settings`
fallisce tutta insieme perché il codice chiede `regime_chiamata` — quindi le
Impostazioni mostrano i default e salvarle dà errore — la pagina Disponibilità
non trova la tabella, e il motivo `chiamata` lo rifiuta il vincolo.

> ⚠️ **Sul Mac di Patrick il `SUPABASE_DB_PASSWORD` non è quello giusto**: il
> 28 agosto 2026 `verifica-schema.mjs` rispondeva *«Host aws-1-eu-west-1…
> raggiunto, ma la password non va»*. Da lì la `19` non si è potuta lanciare,
> e infatti **non è mai stata provata contro un database vero**: si incolla nel
> SQL Editor di Supabase, oppure si rimette la password in `.env.db`.

## ⚠️ Scritto ma mai visto a schermo

Tutto quello che segue è stato scritto senza poterlo guardare a schermo: sul
Mac `.env.db` non ha la password giusta, quindi niente migrazioni e niente
dati veri da cui partire. Passano `npm run prove` (168 controlli), `npx tsc
--noEmit`, `npx eslint src scripts` e `npm run build` — che non è la stessa
cosa.

Da provare nel browser, in quest'ordine:

0. **Le regole di ingaggio di chi è a chiamata**, che sono la cosa più nuova e
   la meno guardata (28 agosto 2026, migrazione `19`). Nell'ordine:
   - in Impostazioni, che la scelta fra i tre modi si salvi e resti;
   - con **«segnala quando non può»**: una persona a chiamata segna un giorno
     da Disponibilità, e sul tabellone quella casella si vede rossa *prima* di
     cliccarci; salvando un turno lì l'app deve rifiutare con la frase che
     nomina il giorno e le ore;
   - con **«segnala quando può»**: le caselle senza dichiarazione devono
     comparire grigie e dire «nessuna disp.»; un turno che esce di un'ora
     dalla fascia dichiarata dev'essere rifiutato, uno dentro no;
   - con **«chiedi ogni volta»**: la voce Disponibilità sparisce dal menu *e*
     dal suo indirizzo; pubblicando una settimana con turni a una persona a
     chiamata deve arrivarle **una** richiesta sulla settimana, non una per
     turno; e un turno aggiunto dopo la pubblicazione dev'essere una chiamata
     singola, che dice «finché non rispondi questo turno non è tuo»;
   - la **copia** di una settimana verso giorni in cui qualcuno non è
     disponibile: deve copiare il resto e dire quanti ne ha lasciati indietro;
   - il calendario **da telefono**: la selezione di più giorni e la barra in
     fondo sono la parte che a schermo grande sembra sempre a posto;
   - il responsabile che segna al posto di qualcuno, scegliendo il nome;
   - un turno di notte, 22:00–06:00, con il **giorno dopo** dichiarato: il
     rifiuto deve nominare il sabato, non il venerdì.
1. **La posta del dipendente** (`components/turni/posta.tsx`, mai renderizzata):
   che compaia in cima, che il bottone la accartocci nella pastiglia, che
   riaprendola torni tutto, e che una voce sparisca **solo** dopo la
   risposta. Da telefono soprattutto.
2. **La settimana in straordinario**: accendere `conferma_settimana`,
   pubblicare una settimana che sfonda il contratto di qualcuno, controllare
   che la richiesta nasca solo per chi ha un accesso e un monte ore. Poi il sì
   con nota e il no senza motivazione, che dev'essere rifiutato.
3. **Gli avvisi**: accorciare un turno pubblicato, cancellarne uno,
   riassegnarne uno; controllare che arrivi l'avviso giusto a chi lo perde e
   che «ho letto» lo faccia sparire per sempre.
4. **Le frecce dopo Conferma**: confermare un blocco di modifiche e premere
   indietro — deve tornare tutto, non l'ultimo turno. Poi avanti.
5. **Le Impostazioni dei Turni**: i tre gruppi, il riquadro «sempre attiva», e
   che salvando non si perda nessuna delle cinque levette. Anche la stessa
   schermata ridotta in `/admin`, alla creazione di un'azienda.
6. **La domanda alla pubblicazione**: una settimana con qualcuno sotto
   contratto deve fermarsi e mostrare i nomi con le ore mancanti. Provare tutte
   e due le strade — «Torno indietro» e «Pubblica lo stesso» — e poi la stessa
   settimana con quella persona segnata assente, che deve pubblicarsi senza
   chiedere niente.
7. **Un turno spostato dal mattino al pomeriggio**: adesso è una cosa da
   accettare, non un avviso.
8. **Sospendi/riattiva in Squadra**, compreso il rifiuto sull'unico
   responsabile attivo.

## Non c'è ancora

- **Il controllo delle disponibilità sull'importazione da foglio.** `salvaTurno`
  e `copiaTurni` lo fanno, `turni/importa` no: un foglio Excel può scrivere
  turni a chi quel giorno ha detto di non esserci. È lo stesso buco che ha già
  la regola delle assenze, e si chiude nello stesso punto — `parse.ts` sa già
  chi è ogni persona, manca il giro che chiede a `esitoAssegnazione`.
- **Il buco lasciato da una chiamata rifiutata si chiude solo riassegnando la
  stessa persona.** È la regola generale dei `da_rifare`, e sotto `on_demand`
  si sente di più: lì rifiutare è normale — chiami, ti dicono di no, chiami un
  altro — e il messaggio resta aperto finché il responsabile non lo chiude a
  mano. Va deciso se un turno nuovo *per chiunque* in quel giorno debba
  chiuderlo.
- **Lettura dei turni da una foto.** L'importazione legge Excel e CSV; una foto
  del tabellone appeso in bacheca no.
- **Notifiche fuori dall'app**, né email né push. Dentro l'app ora qualcosa
  c'è — la posta in cima ai Turni — ma resta una cosa che si vede *aprendo*
  l'app. Un turno pubblicato o modificato non avvisa
  nessuno, e nemmeno un rifiuto: chi vuole saperlo apre l'app. Con la
  preapprovazione pesa di più — un no scritto sabato sera lo si scopre solo
  aprendo la casella dei messaggi.
- **Generazione automatica dei turni: manca l'interfaccia.** Il motore c'è
  (`src/lib/generazione.ts`, provato da `npm run prove`, regole in
  [04-regole.md](04-regole.md)): dalle fasce di copertura tira fuori chi
  metterebbe e cosa resta scoperto. Quello che non c'è è il resto: un bottone
  nel tabellone, un'anteprima che mostri le proposte **prima** di scriverle —
  come fa già l'importazione — e la Server Action che le salva. Finché non
  c'è, quel motore non lo chiama nessuno.
- **Pubblicazione su un indirizzo pubblico.** L'app gira in locale e sull'APK
  di prova puntato alla rete di casa. Vedi [06-ambiente.md](06-ambiente.md) per
  cosa fare al momento del deploy.
- **App sugli store.** C'è il guscio Capacitor per Android e un APK di debug;
  iOS non è nemmeno impostato.
- **Storico e archiviazione.** Non c'è un modo per chiudere un anno: le
  settimane vecchie restano tutte lì.

## Decisioni aperte

**Quanto riposo fra due turni.** Il motore lascia undici ore fra un turno e
quello del giorno dopo, ma **non** guarda dentro la stessa giornata, dove il
turno spezzato è normale. È una semplificazione: la legge ragiona su undici ore
consecutive ogni ventiquattro, e questa regola non è quella. Fa il suo lavoro
— impedisce la chiusura seguita dall'apertura — e non impedisce ciò che
l'azienda fa tutti i giorni. Se un domani servisse il conto vero, il posto è
`riposoRispettato()`.

**Il motore guarda una settimana per volta.** L'equità è dentro la settimana:
chi è più sotto le sue ore viene prima. Fra una settimana e l'altra no — chi ha
fatto tre domeniche di fila non ha nessuna precedenza a saltare la quarta,
perché il motore le domeniche di prima non le vede proprio.

**Ogni persona in turno deve avere un account con una email vera** — non è
più vero dalla migrazione `07`, ma resta la coda della decisione: l'importazione
**importa solo i turni di chi è già in squadra**. Chi compare nel foglio e non
in squadra viene lasciato fuori, e va aggiunto prima a mano. L'alternativa
sarebbe creare le persone mancanti durante l'importazione stessa.

**Una settimana rifiutata non si disfa da sola.** Il responsabile riceve il no
con la motivazione e rifà la settimana a mano. È voluto — non esiste un «prima»
a cui tornare per una settimana appena pubblicata, e sette giorni non si
ripristinano come un turno — ma resta il caso in cui l'app aiuta di meno:
dice cosa non va e poi si ferma.

**Il ritocco chiesto insieme a un sì è testo libero.** Nessuno lo collega al
giorno di cui parla, quindi il responsabile lo legge e va a cercarselo. Legarlo
a un turno vorrebbe dire farglielo scegliere in un elenco, e forse è peggio.

**Del «pubblica lo stesso» non resta traccia.** Chi ha proseguito su una
settimana corta lo sa lui e basta: non c'è una riga da nessuna parte che dica
quale settimana è stata pubblicata sotto contratto e di quanto. Per una
contestazione a fine mese servirebbe.

**`contract_type` e `on_call` dicono la stessa cosa in due modi.** `on_call` è
il gemello operativo di `contract_type = 'chiamata'`, tenuti d'accordo da
`rapportoSchema`. Funziona, ma è un campo di troppo che prima o poi qualcuno
scriverà da solo dimenticando l'altro. Il vincolo `profiles_ore_o_chiamata`
copre il caso peggiore.

**I tipi TypeScript sono scritti a mano** (`src/lib/types.ts`), non generati
dallo schema. Una colonna aggiunta in una migrazione e dimenticata lì dentro
non dà nessun errore: dà `undefined` a runtime.

**Le migrazioni si incollano a mano** nel SQL Editor, in ordine numerico. Non
c'è `supabase db push` né una tabella che registri cosa è già stato eseguito:
sapere se un database è aggiornato vuol dire far girare
`scripts/verifica-schema.mjs`.

## Trappole note, non risolte

- **Il numero delle migrazioni cresce e basta.** Alcune riscrivono policy delle
  precedenti (la `04` e la `06` e la `10` riscrivono tutte `absences_select` o
  `shifts_select`): per sapere quale policy è viva bisogna leggere l'**ultima**
  che la nomina, non la prima.
- **Le colonne si chiamano ancora `conferma_*`** anche se dal 25 agosto 2026 il
  verso è rovesciato: quei turni non aspettano un sì, si possono rifiutare.
  Rinominarle costerebbe una migrazione e una giornata di disallineamento; chi
  legge lo schema senza [04-regole.md](04-regole.md) capisce il contrario.
- **Le tre `pagina_*` valgono in due posti** che nessuno tiene d'accordo
  automaticamente: il menu in `layout.tsx` e la guardia dentro ciascuna pagina.
  Aggiungerne una quarta vuol dire ricordarsi di entrambi.
- **I motivi degli avvisi sono elencati in tre posti**: il vincolo su
  `shift_notices.motivo`, il tipo `MotivoAvviso`, e la mappa `COSA_E_SUCCESSO`
  in `components/turni/posta.tsx`. Stesso difetto dei motivi di rifiuto, qui
  sotto.
- ~~**I motivi di rifiuto sono elencati in tre posti.**~~ Risolto il 26 agosto
  2026: `MOTIVI_RIFIUTO` (`src/lib/types.ts`) è l'unico elenco, e da lì si
  derivano il tipo e la validazione zod; le mappe delle etichette sono
  `Record<MotivoRifiuto, string>`, quindi le tiene in pari il compilatore.
  Resta la copia nel vincolo `shifts_richiede_conferma_valido`, che
  `verifica-schema.mjs` controlla.
- **Le causali sono elencate in tre posti**: il vincolo CHECK su
  `absences.type`, quello su `vacation_requests.type`, e `CAUSALI` in
  `src/lib/assenze.ts`. Aggiungerne una vuol dire toccarli tutti e tre.
- **I default delle impostazioni sono scritti due volte**: nella colonna e in
  `IMPOSTAZIONI_DEFAULT`. Sono d'accordo oggi; niente li tiene d'accordo domani.
- **L'APK di prova punta a un indirizzo di rete locale** codificato nel
  `capacitor.config.ts` (`192.168.1.212` come ripiego). Basta un riavvio del
  router e il vecchio APK punta al vuoto.

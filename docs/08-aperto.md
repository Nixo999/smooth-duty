# Cosa manca, cosa è in dubbio

Il documento delle cose non fatte. Quando una voce viene chiusa, si toglie da
qui e si scrive nel [diario](07-diario.md).

## ⚠️ Da fare prima di usare l'app — 26 agosto 2026

**La migrazione `16` non è ancora stata eseguita su nessun database.** Il
codice la dà per fatta.

```bash
node --env-file=.env.local --env-file=.env.db scripts/esegui-sql.mjs supabase/16-avvisi-e-settimana.sql
node --env-file=.env.local --env-file=.env.db scripts/verifica-schema.mjs
```

Finché non gira, l'app **non si rompe ma mente**: le letture di
`shift_notices` e `week_requests` falliscono e tornano elenchi vuoti (nessun
avviso, nessuna richiesta di settimana), e `company_settings` fallisce tutta
insieme perché chiede `conferma_settimana` — quindi le Impostazioni mostrano i
default e salvarle dà errore. È esattamente il tipo di guasto che il
[05](05-convenzioni.md) racconta: un errore che si traveste da «non c'è
niente».

## ⚠️ Scritto ma mai visto a schermo

Tutto quello che segue è stato fatto sul Mac, dove **non ci sono
`.env.local` né `.env.db`**: non si è potuto aprire una schermata e guardarla.
Passano `npm run prove` (132 controlli), `npx tsc --noEmit`, `npx eslint src
scripts` e `npm run build` — che non è la stessa cosa.

Da provare nel browser, in quest'ordine:

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
5. **Le Impostazioni dei Turni**: i tre gruppi, e che salvando non si perda
   nessuna delle sei levette.
6. **Sospendi/riattiva in Squadra**, compreso il rifiuto sull'unico
   responsabile attivo.

## Non c'è ancora

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
- **I motivi di rifiuto sono elencati in tre posti**: il vincolo
  `shifts_richiede_conferma_valido`, il tipo `MotivoRifiuto`, e la mappa `COSA`
  in `components/turni/messaggi.tsx`.
- **Le causali sono elencate in tre posti**: il vincolo CHECK su
  `absences.type`, quello su `vacation_requests.type`, e `CAUSALI` in
  `src/lib/assenze.ts`. Aggiungerne una vuol dire toccarli tutti e tre.
- **I default delle impostazioni sono scritti due volte**: nella colonna e in
  `IMPOSTAZIONI_DEFAULT`. Sono d'accordo oggi; niente li tiene d'accordo domani.
- **L'APK di prova punta a un indirizzo di rete locale** codificato nel
  `capacitor.config.ts` (`192.168.1.212` come ripiego). Basta un riavvio del
  router e il vecchio APK punta al vuoto.

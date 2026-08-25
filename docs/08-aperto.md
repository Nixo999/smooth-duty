# Cosa manca, cosa è in dubbio

Il documento delle cose non fatte. Quando una voce viene chiusa, si toglie da
qui e si scrive nel [diario](07-diario.md).

## Non c'è ancora

- **Lettura dei turni da una foto.** L'importazione legge Excel e CSV; una foto
  del tabellone appeso in bacheca no.
- **Notifiche**, né email né push. Un turno pubblicato o modificato non avvisa
  nessuno, e nemmeno un rifiuto: chi vuole saperlo apre l'app. Con la
  preapprovazione pesa di più — un no scritto sabato sera lo si scopre solo
  aprendo la casella dei messaggi.
- **Generazione automatica dei turni.** Le fasce di copertura dicono cosa
  serve, ma il tabellone lo scrive una persona.
- **Pubblicazione su un indirizzo pubblico.** L'app gira in locale e sull'APK
  di prova puntato alla rete di casa. Vedi [06-ambiente.md](06-ambiente.md) per
  cosa fare al momento del deploy.
- **App sugli store.** C'è il guscio Capacitor per Android e un APK di debug;
  iOS non è nemmeno impostato.
- **Storico e archiviazione.** Non c'è un modo per chiudere un anno: le
  settimane vecchie restano tutte lì.

## Decisioni aperte

**Ogni persona in turno deve avere un account con una email vera** — non è
più vero dalla migrazione `07`, ma resta la coda della decisione: l'importazione
**importa solo i turni di chi è già in squadra**. Chi compare nel foglio e non
in squadra viene lasciato fuori, e va aggiunto prima a mano. L'alternativa
sarebbe creare le persone mancanti durante l'importazione stessa.

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

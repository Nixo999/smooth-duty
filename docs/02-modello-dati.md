# Il modello dei dati

**Unica fonte di verità: `supabase/*.sql`**, da eseguire in ordine numerico nel
SQL Editor di Supabase. Non c'è `supabase db push` né tipi generati: le
migrazioni sono file da incollare, e i tipi TypeScript sono scritti a mano in
`src/lib/types.ts` — vanno tenuti allineati a mano.

## Le migrazioni, in ordine

| File | Cosa introduce |
|---|---|
| `01-schema.sql` | `companies`, `profiles`, `shifts`; RLS e le funzioni `current_company_id()` / `is_capo()` |
| `02-amministratori.sql` | `platform_admins`, `must_change_password`, `mark_password_changed()` |
| `03-vincoli.sql` | il turno e la persona devono essere della stessa azienda (trigger) |
| `04-reparti-e-copertura.sql` | `departments`, `coverage_bands`, ore da contratto, `on_call` |
| `05-assenze.sql` | `absences`, una sola aperta per persona, `conferma_rientro()` |
| `06-causali-e-riservatezza.sql` | causali all'italiana (da enum a testo+CHECK), vista `absence_days` |
| `07-persone-senza-account.sql` | `profiles.user_id` staccato da `auth.users`; nasce `current_profile_id()` |
| `08-piu-reparti.sql` | `profile_departments`, vista `reparto_piu_frequente` |
| `09-ferie.sql` | `vacation_requests` (richieste con riserva) |
| `10-permessi.sql` | la richiesta porta la sua causale; riservatezza per causale |
| `11-impostazioni.sql` | `company_settings`, conferme sui turni, orario preimpostato |
| `12-pubblicazione-e-contratti.sql` | `published_weeks` (rovescia le bozze), `contract_type` |
| `13-pagine-e-cambio-reparto.sql` | le pagine che l'azienda usa (`pagina_*`), il motivo `cambio_reparto` |
| `14-preapprovazione-e-rifiuti.sql` | **rovescia le conferme**: il turno vale subito e si può rifiutare. `shift_messages`, `rifiuta_turno()` |
| `15-accettazione-esplicita.sql` | torna il sì accanto al no: `accetta_turno()`, e non si rifiuta ciò che si è accettato |

> ⚠️ La `14` definisce `rifiuta_turno()` e la `15` **la ridefinisce**. Chi
> deve cambiarla guardi la `15`: è quella l'ultima parola. Vale in generale —
> più migrazioni riscrivono policy e funzioni delle precedenti, e conta sempre
> l'ultima che le nomina.

> ⚠️ Molte istruzioni sono condizionali (`if not exists`, `exception when
> duplicate_object`): una migrazione che «non dà errori» **non prova** che lo
> schema sia quello giusto. Il controllo vero è `scripts/verifica-schema.mjs`.

## Le tabelle

### `companies`
`id · name · created_at`. Il nome è unico di fatto (l'inserimento risponde
23505 sui duplicati).

### `profiles` — la tabella su cui gira tutto
`id` (uuid proprio, **non** più quello di `auth.users`) · `company_id` ·
`user_id` (→ `auth.users`, **nullabile**) · `full_name` · `email` (nullabile) ·
`role` (`capo` | `dipendente`) · `active` · `must_change_password` ·
`department_id` (reparto **principale**) · `contract_hours` (0–80, settimanali,
null per chi è a chiamata) · `on_call` · `contract_type` (`chiamata` |
`part_time` | `full_time`) · `preset_start` / `preset_end`.

Vincoli che contano:
- `profiles_ore_o_chiamata`: o hai un monte ore, o sei a chiamata. Mai
  entrambi.
- `profiles_accesso_coerente`: chi non ha `user_id` non può avere
  `must_change_password` alzato — non ha una password da cambiare.
- `contract_type` comanda, `on_call` è il suo gemello operativo. Chi scrive
  passa da `rapportoSchema` (`src/lib/persone.ts`), che li tiene d'accordo.

### `shifts`
`company_id · profile_id` (**nullabile** = turno scoperto, da assegnare) ·
`date` (data civile) · `start_time` · `end_time` · `title · location · notes` ·
`department_id` (reparto *solo per questo turno*) · `created_by` ·
`updated_at` (trigger `touch_updated_at`).

Poi i campi della **preapprovazione**, che si leggono insieme:
- `richiede_conferma` — perché su questo turno l'interessato può dire la sua:
  `straordinario` | `modifica` | `modifica_straordinario` | `orario_diverso` |
  `cambio_reparto` | null. Vincolo `shifts_richiede_conferma_valido`;
- `confermato_at` — ha detto di sì;
- `rifiutato_at` · `nota_rifiuto` — ha detto di no, e volendo perché;
- `stato_prima` (jsonb) — la fotografia di com'era il turno, per poterlo
  rimettere se l'interessato rifiuta. **null = il turno è nato adesso**, e
  allora un rifiuto lo toglie invece di riportarlo indietro.

Le due date si escludono a vicenda; a leggerle insieme pensa `statoConferma()`
in `src/lib/conferme.ts`.

Indici: `(company_id, date)` e `(profile_id, date)` — sono esattamente le due
interrogazioni che fa l'app.

### `shift_messages`
Il no di un dipendente in attesa del responsabile. `profile_id` (chi ha
rifiutato) · `shift_id` (nullabile: cancellando il turno il messaggio resta) ·
`motivo` · `nota` · `giorno` · `turno_prima` / `turno_dopo` (jsonb) · `esito`
(`ripristinato` | `da_rifare` | `superato`, **vuoto finché il responsabile non
apre**) · `creato_at` · `visto_at` · `risolto_at`.

Porta con sé tutto quello che serve a raccontarlo e ad applicarlo, perché **il
turno da cui nasce può non esistere più** quando il messaggio viene letto.
Lettura: il responsabile, e l'interessato i propri. Scrittura: solo il
responsabile — l'inserimento non passa dalle policy ma da `rifiuta_turno()`,
così nessuno può scrivere un messaggio a nome d'altri.

### `departments`
`company_id · name · hue` (tinta 0–360, **non** un colore finito: chiaro e
scuro hanno bisogno di due luminosità diverse) · `position`. Unico per
`(company_id, name)`.

### `profile_departments`
`(profile_id, department_id)`. I reparti in cui una persona *può* lavorare.
Non contemporaneamente: in un turno fa una cosa sola.

### `coverage_bands`
`department_id · name · start_time · end_time · required` (1–99) · `weekdays`
(array ISO: 1 lunedì … 7 domenica) · `position`. È la regola con cui la
Supervisione stabilisce se una giornata è scoperta.

### `absences`
`profile_id · type` (testo + CHECK, 20 causali) · `start_date` · `end_date`
(**null = ancora in corso**) · `note` · `created_by`.
Indice unico parziale `absences_una_aperta`: **una sola assenza aperta per
persona**.

### `vacation_requests`
La *richiesta*, che è un desiderio con uno stato — cosa diversa dall'assenza,
che è il fatto. `type · start_date · end_date` (obbligatoria) · `status`
(`richiesta` | `approvata` | `rifiutata`) · `absence_id` (l'assenza creata
dall'approvazione, per poterla revocare) · `decided_by`.

### `company_settings`
Una riga per azienda, **facoltativa**: se manca valgono i default, che stanno
scritti due volte — nel `default` della colonna e in `IMPOSTAZIONI_DEFAULT`
(`src/lib/impostazioni.ts`). Chi legge passa sempre da
`normalizzaImpostazioni()`. Dieci campi, raggruppati **per pagina** come nella
schermata che li mostra:

- turni: `conferma_straordinari · conferma_modifiche ·
  conferma_modifiche_straordinari · orari_preimpostati ·
  conferma_cambio_reparto`
- supervisione: `pagina_supervisione · supervisione_dipendenti`
- permessi: `pagina_permessi · causali_richiedibili[]`
- prospetto: `pagina_prospetto`

> I nomi che cominciano per `conferma_` sono nati quando quei turni
> aspettavano un sì. Dalla `14` il verso è rovesciato — il turno vale subito e
> semmai lo si rifiuta — ma le colonne si chiamano ancora così: rinominarle
> costerebbe una migrazione e una giornata di disallineamento senza dire niente
> di più.

### `published_weeks`
`(company_id, monday)`. **Le settimane pubblicate**, non le bozze. Vedi
[04-regole.md](04-regole.md) per il perché del verso.
La tabella `draft_weeks` è esistita per un giorno solo ed è stata ritirata
nella `12`: se la trovi nominata in un documento, quel documento è vecchio.

### `platform_admins`
`user_id · email`. Chi amministra la piattaforma **non appartiene a nessuna
azienda**, per questo non è un ruolo dentro `profiles` (che ha `company_id`
obbligatorio). La policy di select mostra solo la propria riga: serve a
rispondere «sono admin?», non a farsi dare l'elenco.

## Le viste

| Vista | A cosa serve |
|---|---|
| `absence_days` | i **giorni** di assenza senza il motivo, per i colleghi. `security_invoker = false`: gira coi privilegi del proprietario e il confine fra aziende lo tiene la `where` |
| `reparto_piu_frequente` | il reparto in cui ciascuno lavora più spesso, dedotto dai turni già fatti. `security_invoker = true`: eredita le policy |

## Le funzioni SECURITY DEFINER

Esistono per una ragione tecnica precisa: **una policy RLS non deve leggere una
tabella a sua volta protetta da RLS**, o Postgres entra in ricorsione infinita
(errore `42P17`). Quindi azienda e ruolo si leggono da qui.

| Funzione | Cosa fa |
|---|---|
| `current_company_id()` | l'azienda di chi sta chiedendo |
| `current_profile_id()` | il **profilo** di chi sta chiedendo (≠ `auth.uid()` dalla `07`) |
| `is_capo()` | è responsabile, ed è attivo? |
| `is_platform_admin()` | amministra la piattaforma? |
| `mark_password_changed()` | abbassa il flag, **solo sul proprio** profilo |
| `conferma_rientro(primo_giorno)` | chiude la propria assenza aperta al giorno prima |
| `accetta_turno(turno)` | il sì: scrive `confermato_at` **solo** sul proprio turno |
| `rifiuta_turno(turno, motivazione)` | il no: segna il rifiuto **e** lascia il messaggio al responsabile |

`conferma_turno()` **non esiste più** (rimossa dalla `14`): tenerla in giro
avrebbe voluto dire avere due verità su cosa vale un turno.

Sia il sì che il no rifiutano i **giorni già passati** — il confine è la fine
del giorno del turno, in `Europe/Rome` come tutto il resto dell'app — e si
escludono a vicenda: non si accetta ciò che si è rifiutato, non si rifiuta ciò
che si è accettato. Entrambe restituiscono un `boolean`: un `void` che esce in
silenzio farebbe dire all'app «il responsabile è stato avvisato» anche quando
non è partito niente.

Le ultime quattro sono funzioni e non policy di `update` per lo stesso motivo: un
permesso di scrittura sulla tabella lascerebbe cambiare anche il ruolo, gli
orari, o l'assenza di un collega. La funzione tocca un campo e basta.

## Chi vede cosa (RLS, in sintesi)

- **Tutto è per azienda.** Ogni policy confronta `company_id` con
  `current_company_id()`.
- **`shifts`**: in lettura li vede *tutta l'azienda* (serve alla Supervisione).
  Che il dipendente nella sua pagina veda solo i suoi è una scelta **della
  query**, non della policy — `src/app/(app)/turni/page.tsx`. Scrittura: solo
  `is_capo()`.
- **`absences` e `vacation_requests`**: il **motivo** è riservato. Lo vedono il
  responsabile e l'interessato; ai colleghi passano solo le righe con
  `type = 'ferie'` — le ferie sono un fatto d'agenda, la malattia e la legge
  104 no. Stessa regola sulle due tabelle, o la stessa malattia sarebbe
  segreta da una parte e pubblica dall'altra.
- **`departments`, `coverage_bands`, `company_settings`, `published_weeks`**:
  lettura a tutta l'azienda, scrittura al `capo`.
- L'amministratore della piattaforma vede `companies` e `profiles` di tutte le
  aziende. **Per questo le pagine filtrano comunque per `company_id` a mano**:
  senza, un admin che entra in un'azienda si ritroverebbe in squadra le
  persone altrui. RLS è la rete di sicurezza, non il filtro della schermata.

## I trigger di coerenza

Stanno nel database e non nel codice così valgono per **ogni** strada che
scrive — interfaccia, importazione, script, o qualunque cosa venga dopo:

- `shift_profile_matches_company()` — il turno e la persona, stessa azienda
- `shift_department_matches_company()` — il reparto del turno, stessa azienda
- `band_department_matches_company()` — il reparto della fascia
- `profile_department_same_company()` — persona e reparto

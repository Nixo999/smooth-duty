/** Controlla che lo schema sia davvero come le migrazioni dicono, e dice
 *  quali file mancano.
 *
 *  Non basta che una migrazione "non dia errori": molte istruzioni sono
 *  condizionali (if not exists, exception when duplicate_object) e passano in
 *  silenzio anche quando non fanno niente.
 *
 *  ⚠️ I controlli sono raggruppati per migrazione, e non e' un vezzo di
 *  presentazione: e' l'unica forma in cui questo script serve a qualcosa. Il
 *  25 agosto 2026 rispondeva «schema completo» mentre ne mancavano tre —
 *  controllava solo fino alla 04 — e intanto l'app mostrava un tabellone
 *  vuoto al posto di 429 turni. Un elenco piatto di "ok" non dice a nessuno
 *  che cosa lanciare.
 *
 *  **Aggiungendo una migrazione va aggiunto qui il suo gruppo**, altrimenti
 *  questo file torna a mentire con la stessa faccia convinta di allora.
 *
 *    node --env-file=.env.local --env-file=.env.db scripts/verifica-schema.mjs
 */
import { connetti } from "./lib-db.mjs";

const { client, host } = await connetti();
console.log(`connesso a ${host}\n`);

const uno = async (sql, params = []) => (await client.query(sql, params)).rows[0];

/* ------------------------------------------------------------ i controlli
 *
 * Ognuno risponde una domanda sola e restituisce vero o falso. Sono
 * scorciatoie sui cataloghi di Postgres, perche' scritte per esteso ogni
 * controllo sarebbe cinque righe di SQL e nessuno le rileggerebbe. */

const tabella = async (nome) =>
  (await uno("select to_regclass($1) is not null as c", [`public.${nome}`])).c;

const colonna = async (t, c) =>
  (await uno(
    `select count(*)::int as n from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2`,
    [t, c],
  )).n === 1;

const funzione = async (nome) =>
  (await uno(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=$1`,
    [nome],
  )).n >= 1;

/** Il corpo di una funzione contiene questo pezzo? Serve quando una
 *  migrazione non aggiunge una funzione ma ne cambia una che c'e' gia': la
 *  sua presenza non prova niente, il suo contenuto si'. */
const funzioneContiene = async (nome, pezzo) =>
  (await uno(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=$1 and p.prosrc like '%' || $2 || '%'`,
    [nome, pezzo],
  )).n >= 1;

/** Il testo di un vincolo contiene questo pezzo? Come `funzioneContiene`, e
 *  per la stessa ragione: una migrazione che riscrive un CHECK esistente si
 *  riconosce solo da cosa quel CHECK ammette adesso. */
const vincoloContiene = async (nome, pezzo) =>
  (await uno(
    `select count(*)::int as n from pg_constraint
      where conname = $1 and pg_get_constraintdef(oid) like '%' || $2 || '%'`,
    [nome, pezzo],
  )).n >= 1;

const trigger = async (t, nome) =>
  (await uno(
    `select count(*)::int as n from pg_trigger g join pg_class c on c.oid=g.tgrelid
      where c.relname=$1 and g.tgname=$2 and not g.tgisinternal`,
    [t, nome],
  )).n === 1;

const vincolo = async (nome, pezzo = null) =>
  (await uno(
    `select count(*)::int as n from pg_constraint
      where conname=$1 and ($2::text is null or pg_get_constraintdef(oid) like '%' || $2 || '%')`,
    [nome, pezzo],
  )).n >= 1;

const rls = async (t) =>
  Boolean(
    (await uno(
      `select relrowsecurity as r from pg_class
        where relnamespace='public'::regnamespace and relname=$1`,
      [t],
    ))?.r,
  );

const indice = async (nome) =>
  (await uno("select count(*)::int as n from pg_indexes where indexname=$1", [nome])).n === 1;

/** Una policy esiste e la sua condizione contiene (o non contiene) qualcosa.
 *  E' il modo per distinguere una policy riscritta da una vecchia rimasta li'
 *  con lo stesso nome. */
const policy = async (t, nome, { contiene = null, senza = null } = {}) => {
  const r = await uno(
    `select qual::text as q from pg_policies
      where schemaname='public' and tablename=$1 and policyname=$2`,
    [t, nome],
  );
  if (!r) return false;
  if (contiene && !r.q.includes(contiene)) return false;
  if (senza && r.q.includes(senza)) return false;
  return true;
};

/** Il contrario: una cosa che una migrazione ha **tolto** e non deve tornare.
 *  Trovarla ancora li' vuol dire che quella migrazione non e' passata. */
const assente = async (chi) => !(await chi());

/** Nessuno oltre al proprietario puo' eseguirla.
 *
 *  In Postgres una funzione nuova nasce eseguibile da PUBLIC, e su una
 *  SECURITY DEFINER quella e' la differenza fra una difesa e un regalo: chi
 *  volesse provare password all'infinito potrebbe chiamare da se' la
 *  funzione che azzera il conto. Le migrazioni lo revocano, e questo
 *  controlla che la revoca ci sia ancora. */
const nonEseguibileDaTutti = async (nome) =>
  (await uno(
    `select count(*)::int as n
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1
        and (
          has_function_privilege('public', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
        )`,
    [nome],
  )).n === 0;

const nullabile = async (t, c) =>
  (await uno(
    `select is_nullable as n from information_schema.columns
      where table_schema='public' and table_name=$1 and column_name=$2`,
    [t, c],
  ))?.n === "YES";

/* --------------------------------------------------------- le migrazioni */

const MIGRAZIONI = [
  {
    file: "01-schema.sql",
    cosa: "tabelle di base, RLS, funzioni di sicurezza",
    prove: [
      ["tabella companies", () => tabella("companies")],
      ["tabella profiles", () => tabella("profiles")],
      ["tabella shifts", () => tabella("shifts")],
      ["funzione current_company_id()", () => funzione("current_company_id")],
      ["funzione is_capo()", () => funzione("is_capo")],
      ["trigger shifts_touch_updated_at", () => trigger("shifts", "shifts_touch_updated_at")],
      ["RLS su companies", () => rls("companies")],
      ["RLS su profiles", () => rls("profiles")],
      ["RLS su shifts", () => rls("shifts")],
    ],
  },
  {
    file: "02-amministratori.sql",
    cosa: "amministratori della piattaforma e password provvisorie",
    prove: [
      ["tabella platform_admins", () => tabella("platform_admins")],
      ["RLS su platform_admins", () => rls("platform_admins")],
      ["colonna profiles.must_change_password", () => colonna("profiles", "must_change_password")],
      ["funzione mark_password_changed()", () => funzione("mark_password_changed")],
    ],
  },
  {
    file: "03-vincoli.sql",
    cosa: "il turno e la persona devono essere della stessa azienda",
    prove: [
      ["funzione shift_profile_matches_company()", () => funzione("shift_profile_matches_company")],
      ["trigger shifts_profile_company_check", () => trigger("shifts", "shifts_profile_company_check")],
    ],
  },
  {
    file: "04-reparti-e-copertura.sql",
    cosa: "reparti, ore da contratto, fasce di copertura",
    prove: [
      ["tabella departments", () => tabella("departments")],
      ["tabella coverage_bands", () => tabella("coverage_bands")],
      ["colonna departments.hue", () => colonna("departments", "hue")],
      ["colonna coverage_bands.weekdays", () => colonna("coverage_bands", "weekdays")],
      ["colonna profiles.department_id", () => colonna("profiles", "department_id")],
      ["colonna profiles.contract_hours", () => colonna("profiles", "contract_hours")],
      ["colonna profiles.on_call", () => colonna("profiles", "on_call")],
      ["colonna shifts.department_id", () => colonna("shifts", "department_id")],
      ["vincolo ore-o-a-chiamata", () => vincolo("profiles_ore_o_chiamata")],
      ["trigger coverage_bands_company_check", () => trigger("coverage_bands", "coverage_bands_company_check")],
      ["trigger shifts_department_company_check", () => trigger("shifts", "shifts_department_company_check")],
      // I dipendenti devono vedere i turni dell'azienda: serve alla
      // Supervisione. La policy vecchia li limitava ai propri.
      ["policy shifts_select allargata all'azienda", () => policy("shifts", "shifts_select", { senza: "is_capo" })],
    ],
  },
  {
    file: "05-assenze.sql",
    cosa: "assenze, una sola aperta per persona, conferma del rientro",
    prove: [
      ["tabella absences", () => tabella("absences")],
      ["RLS su absences", () => rls("absences")],
      ["indice una-sola-assenza-aperta", () => indice("absences_una_aperta")],
      ["funzione conferma_rientro()", () => funzione("conferma_rientro")],
      ["trigger absences_company_check", () => trigger("absences", "absences_company_check")],
    ],
  },
  {
    file: "06-causali-e-riservatezza.sql",
    cosa: "causali all'italiana e riservatezza del motivo",
    prove: [
      ["vincolo causale valida su absences", () => vincolo("absences_causale_valida")],
      // Il motivo non deve uscire dalla vista: e' li' che sta la riservatezza.
      ["vista absence_days", () => tabella("absence_days")],
      ["absence_days non espone il motivo", async () => !(await colonna("absence_days", "type"))],
    ],
  },
  {
    file: "07-persone-senza-account.sql",
    cosa: "una persona puo' stare in squadra senza un accesso",
    prove: [
      ["colonna profiles.user_id", () => colonna("profiles", "user_id")],
      ["profiles.email puo' essere vuota", () => nullabile("profiles", "email")],
      ["funzione current_profile_id()", () => funzione("current_profile_id")],
      ["vincolo accesso coerente", () => vincolo("profiles_accesso_coerente")],
      // Le funzioni della 01 sono state riscritte per leggere user_id: la
      // loro presenza non basta, conta il contenuto.
      ["is_capo() guarda user_id", () => funzioneContiene("is_capo", "user_id")],
    ],
  },
  {
    file: "08-piu-reparti.sql",
    cosa: "una persona puo' lavorare in piu' reparti",
    prove: [
      ["tabella profile_departments", () => tabella("profile_departments")],
      ["RLS su profile_departments", () => rls("profile_departments")],
      ["funzione profile_department_same_company()", () => funzione("profile_department_same_company")],
      ["vista reparto_piu_frequente", () => tabella("reparto_piu_frequente")],
    ],
  },
  {
    file: "09-ferie.sql",
    cosa: "richieste di ferie con riserva",
    prove: [
      ["tabella vacation_requests", () => tabella("vacation_requests")],
      ["RLS su vacation_requests", () => rls("vacation_requests")],
      ["funzione vacation_profile_matches_company()", () => funzione("vacation_profile_matches_company")],
    ],
  },
  {
    file: "10-permessi.sql",
    cosa: "si chiede qualunque assenza; riservatezza per causale",
    prove: [
      ["colonna vacation_requests.type", () => colonna("vacation_requests", "type")],
      ["vincolo causale valida sulle richieste", () => vincolo("vacation_requests_causale_valida")],
      // Le ferie le vede tutta l'azienda, ogni altra causale no: e' quel
      // "ferie" dentro la policy a dirlo.
      ["policy absences_select distingue le ferie", () => policy("absences", "absences_select", { contiene: "ferie" })],
      ["policy vacation_requests_select distingue le ferie", () => policy("vacation_requests", "vacation_requests_select", { contiene: "ferie" })],
    ],
  },
  {
    file: "11-impostazioni.sql",
    cosa: "impostazioni dell'azienda e orario da contratto",
    prove: [
      ["tabella company_settings", () => tabella("company_settings")],
      ["RLS su company_settings", () => rls("company_settings")],
      ["colonna company_settings.supervisione_dipendenti", () => colonna("company_settings", "supervisione_dipendenti")],
      ["colonna company_settings.conferma_straordinari", () => colonna("company_settings", "conferma_straordinari")],
      ["colonna company_settings.orari_preimpostati", () => colonna("company_settings", "orari_preimpostati")],
      ["colonna shifts.richiede_conferma", () => colonna("shifts", "richiede_conferma")],
      ["colonna shifts.confermato_at", () => colonna("shifts", "confermato_at")],
      ["colonna profiles.preset_start", () => colonna("profiles", "preset_start")],
      ["colonna profiles.preset_end", () => colonna("profiles", "preset_end")],
    ],
  },
  {
    file: "12-pubblicazione-e-contratti.sql",
    cosa: "settimane pubblicate e tipo di contratto",
    prove: [
      ["tabella published_weeks", () => tabella("published_weeks")],
      ["RLS su published_weeks", () => rls("published_weeks")],
      ["colonna profiles.contract_type", () => colonna("profiles", "contract_type")],
      // La tabella di ieri, ritirata: se e' ancora li' la 12 non e' passata.
      ["draft_weeks ritirata", () => assente(() => tabella("draft_weeks"))],
    ],
  },
  {
    file: "13-pagine-e-cambio-reparto.sql",
    cosa: "le pagine che l'azienda usa, e il cambio di solo reparto",
    prove: [
      ["colonna company_settings.pagina_supervisione", () => colonna("company_settings", "pagina_supervisione")],
      ["colonna company_settings.pagina_permessi", () => colonna("company_settings", "pagina_permessi")],
      ["colonna company_settings.pagina_prospetto", () => colonna("company_settings", "pagina_prospetto")],
      ["colonna company_settings.conferma_cambio_reparto", () => colonna("company_settings", "conferma_cambio_reparto")],
      ["il motivo cambio_reparto e' ammesso", () => vincolo("shifts_richiede_conferma_valido", "cambio_reparto")],
    ],
  },
  {
    file: "14-preapprovazione-e-rifiuti.sql",
    cosa: "il turno vale subito, e il dipendente lo puo' rifiutare",
    prove: [
      // Sono le due colonne che il 25 agosto facevano fallire l'intera
      // lettura dei turni: il codice le chiedeva, il database non le aveva.
      ["colonna shifts.rifiutato_at", () => colonna("shifts", "rifiutato_at")],
      ["colonna shifts.nota_rifiuto", () => colonna("shifts", "nota_rifiuto")],
      ["colonna shifts.stato_prima", () => colonna("shifts", "stato_prima")],
      ["tabella shift_messages", () => tabella("shift_messages")],
      ["RLS su shift_messages", () => rls("shift_messages")],
      ["funzione rifiuta_turno()", () => funzione("rifiuta_turno")],
      ["conferma_turno() ritirata", () => assente(() => funzione("conferma_turno"))],
    ],
  },
  {
    file: "15-accettazione-esplicita.sql",
    cosa: "il si' esplicito torna, accanto al no",
    prove: [
      ["funzione accetta_turno()", () => funzione("accetta_turno")],
      // La 15 riscrive rifiuta_turno aggiungendo il controllo sul si' gia'
      // dato: la funzione c'era gia', quindi va guardato il corpo.
      ["rifiuta_turno() rispetta il si' gia' dato", () => funzioneContiene("rifiuta_turno", "confermato_at")],
    ],
  },
  {
    file: "16-avvisi-e-settimana.sql",
    cosa: "chi perde ore lo sa, chi ne guadagna decide",
    prove: [
      ["company_settings.conferma_settimana", () => colonna("company_settings", "conferma_settimana")],
      ["tabella shift_notices", () => tabella("shift_notices")],
      ["shift_notices.letto_at", () => colonna("shift_notices", "letto_at")],
      ["funzione segna_avviso_letto()", () => funzione("segna_avviso_letto")],
      ["tabella week_requests", () => tabella("week_requests")],
      ["week_requests.minuti_previsti", () => colonna("week_requests", "minuti_previsti")],
      ["funzione accetta_settimana()", () => funzione("accetta_settimana")],
      ["funzione rifiuta_settimana()", () => funzione("rifiuta_settimana")],
      // Il no senza motivazione non deve passare: e' la riga che rende utile
      // la richiesta, non un vezzo di forma.
      ["rifiuta_settimana() pretende la motivazione", () => funzioneContiene("rifiuta_settimana", "pulita is null")],
    ],
  },
  {
    file: "17-turno-spostato.sql",
    cosa: "spostare un turno si chiede, non si comunica",
    prove: [
      // La 17 non aggiunge niente: riscrive un vincolo che c'era gia', quindi
      // la sua presenza non prova niente e va guardato cosa ammette.
      [
        "shifts accetta il motivo turno_spostato",
        () => vincoloContiene("shifts_richiede_conferma_valido", "turno_spostato"),
      ],
    ],
  },
  {
    file: "18-tentativi-di-accesso.sql",
    cosa: "provare all'infinito non si puo': il conto dei tentativi falliti",
    prove: [
      ["tabella access_attempts", () => tabella("access_attempts")],
      ["RLS su access_attempts", () => rls("access_attempts")],
      ["indice per chiave", () => indice("access_attempts_chiave_idx")],
      ["funzione tentativi_recenti()", () => funzione("tentativi_recenti")],
      ["funzione segna_tentativo()", () => funzione("segna_tentativo")],
      ["funzione azzera_tentativi()", () => funzione("azzera_tentativi")],
      // Il pezzo che conta davvero: se `azzera_tentativi` restasse
      // eseguibile da chiunque, chi sta provando password si toglierebbe
      // da solo il blocco appena preso.
      ["azzera_tentativi non e' pubblica", () => nonEseguibileDaTutti("azzera_tentativi")],
      ["segna_tentativo non e' pubblica", () => nonEseguibileDaTutti("segna_tentativo")],
      ["tentativi_recenti non e' pubblica", () => nonEseguibileDaTutti("tentativi_recenti")],
    ],
  },
];

/* ------------------------------------------------------------- il giro */

const daEseguire = [];
let guaste = 0;

for (const m of MIGRAZIONI) {
  const rotte = [];
  for (const [cosa, prova] of m.prove) {
    let ok = false;
    try {
      ok = Boolean(await prova());
    } catch (e) {
      ok = false;
      rotte.push(`${cosa} — ${e.message}`);
      continue;
    }
    if (!ok) rotte.push(cosa);
  }

  if (rotte.length === 0) {
    console.log(`ok   ${m.file}`);
    continue;
  }

  guaste++;
  // Tutto mancante = la migrazione non e' mai passata. Qualcosa mancante e'
  // peggio, perche' vuol dire che e' passata a meta': lo si dice diverso.
  const tutta = rotte.length === m.prove.length;
  console.log(`NO   ${m.file}  (${tutta ? "mai eseguita" : "eseguita a meta'"})`);
  for (const r of rotte) console.log(`       manca: ${r}`);
  daEseguire.push(m.file);
}

console.log("");

if (daEseguire.length === 0) {
  console.log(`schema allineato a tutte e ${MIGRAZIONI.length} le migrazioni.`);
} else {
  console.log(
    `${guaste} migrazioni su ${MIGRAZIONI.length} non sono a posto.`,
  );
  console.log("");
  console.log("Eseguile in quest'ordine, dal SQL Editor di Supabase o cosi':");
  for (const f of daEseguire) {
    console.log(
      `  node --env-file=.env.local --env-file=.env.db scripts/esegui-sql.mjs supabase/${f}`,
    );
  }
  console.log("");
  console.log("Sono ri-eseguibili e non cancellano turni: nel dubbio, rilanciale.");
}

await client.end();
process.exit(daEseguire.length === 0 ? 0 : 1);

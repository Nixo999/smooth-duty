/** Controlla che lo schema sia davvero come le migrazioni dicono.
 *
 *  Non basta che una migrazione "non dia errori": molte istruzioni sono
 *  condizionali (if not exists, exception when duplicate_object) e passano in
 *  silenzio anche quando non fanno niente.
 *
 *    node --env-file=.env.local --env-file=.env.db scripts/verifica-schema.mjs
 */
import { connetti } from "./lib-db.mjs";

const { client, host } = await connetti();
console.log(`connesso a ${host}\n`);

let mancanti = 0;
const esito = (ok, cosa, dettaglio = "") => {
  if (!ok) mancanti++;
  console.log(`${ok ? "ok  " : "NO  "}${cosa}${dettaglio ? `  ${dettaglio}` : ""}`);
};

const uno = async (sql, params = []) => (await client.query(sql, params)).rows[0];

/* tabelle */
for (const t of ["companies", "profiles", "shifts", "platform_admins", "departments", "coverage_bands"]) {
  const r = await uno(
    "select to_regclass($1) is not null as c",
    [`public.${t}`],
  );
  esito(r.c, `tabella ${t}`);
}

/* colonne nuove */
const colonne = [
  ["profiles", "department_id"],
  ["profiles", "contract_hours"],
  ["profiles", "on_call"],
  ["profiles", "must_change_password"],
  ["shifts", "department_id"],
  ["coverage_bands", "weekdays"],
  ["departments", "hue"],
];
for (const [t, c] of colonne) {
  const r = await uno(
    `select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [t, c],
  );
  esito(r.n === 1, `colonna ${t}.${c}`);
}

/* funzioni di sicurezza */
for (const f of [
  "current_company_id", "is_capo", "is_platform_admin", "mark_password_changed",
  "shift_profile_matches_company", "band_department_matches_company",
  "shift_department_matches_company",
]) {
  const r = await uno(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [f],
  );
  esito(r.n >= 1, `funzione ${f}()`);
}

/* trigger */
for (const [t, trg] of [
  ["shifts", "shifts_profile_company_check"],
  ["shifts", "shifts_department_company_check"],
  ["coverage_bands", "coverage_bands_company_check"],
  ["shifts", "shifts_touch_updated_at"],
]) {
  const r = await uno(
    `select count(*)::int as n from pg_trigger g join pg_class c on c.oid = g.tgrelid
      where c.relname = $1 and g.tgname = $2 and not g.tgisinternal`,
    [t, trg],
  );
  esito(r.n === 1, `trigger ${trg} su ${t}`);
}

/* RLS attivo ovunque */
const rls = await client.query(
  `select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('companies','profiles','shifts','platform_admins','departments','coverage_bands')
    order by relname`,
);
for (const r of rls.rows) esito(r.relrowsecurity, `RLS attivo su ${r.relname}`);

/* la policy di lettura dei turni deve essere quella nuova */
const policy = await uno(
  `select qual::text as q from pg_policies
    where schemaname='public' and tablename='shifts' and policyname='shifts_select'`,
);
esito(
  Boolean(policy) && !policy.q.includes("is_capo"),
  "policy shifts_select aggiornata",
  policy ? "(i dipendenti vedono i turni dell'azienda)" : "(assente)",
);

/* il vincolo ore-o-chiamata */
const vincolo = await uno(
  `select count(*)::int as n from pg_constraint
    where conname = 'profiles_ore_o_chiamata'`,
);
esito(vincolo.n === 1, "vincolo ore-o-a-chiamata su profiles");

console.log("");
console.log(mancanti === 0 ? "schema completo." : `${mancanti} cose mancano.`);
await client.end();
process.exit(mancanti === 0 ? 0 : 1);

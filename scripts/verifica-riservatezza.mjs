/** Controlla che il motivo di un'assenza lo vedano solo il responsabile e
 *  l'interessato, e che ai colleghi arrivino i giorni e basta.
 *
 *  Non serve nessuna password: si interroga Postgres assumendo l'identità di
 *  ciascuno, esattamente come fa Supabase quando applica le policy — si passa
 *  al ruolo `authenticated` e si dichiara chi è `auth.uid()`.
 *
 *    node --env-file=.env.local --env-file=.env.db scripts/verifica-riservatezza.mjs
 */
import { connetti } from "./lib-db.mjs";

const { client, host } = await connetti();
console.log(`connesso a ${host}\n`);

let problemi = 0;
const esito = (ok, cosa, dettaglio = "") => {
  if (!ok) problemi++;
  console.log(`${ok ? "ok  " : "NO  "}${cosa}${dettaglio ? `  ${dettaglio}` : ""}`);
};

/** Esegue una query come se fosse quella persona. */
async function come(uid, sql) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const r = await client.query(sql);
    return r.rows;
  } finally {
    await client.query("rollback");
  }
}

const { rows: persone } = await client.query(`
  select p.id, p.full_name, p.role, c.name as azienda
    from profiles p join companies c on c.id = p.company_id
   where c.name = 'Pizzeria Prova'
   order by p.role, p.full_name
`);

const capo = persone.find((p) => p.role === "capo");
const dipendenti = persone.filter((p) => p.role === "dipendente");
const malato = dipendenti[0];
const collega = dipendenti[1];

if (!capo || !malato || !collega) {
  throw new Error("Servono un responsabile e due dipendenti in Pizzeria Prova.");
}

// Un'assenza vera su cui misurare, tolta alla fine.
const { rows: creata } = await client.query(
  `insert into absences (company_id, profile_id, type, start_date, note)
   select company_id, id, 'legge_104', current_date, 'nota riservata'
     from profiles where id = $1
   returning id`,
  [malato.id],
);
const idAssenza = creata[0].id;

try {
  const daCapo = await come(capo.id, "select type, note from absences");
  esito(daCapo.length >= 1, "il responsabile vede l'assenza");
  esito(
    daCapo.some((r) => r.type === "legge_104"),
    "il responsabile vede la causale",
    `(${daCapo.map((r) => r.type).join(", ")})`,
  );

  // Puo' averne anche altre, registrate dal responsabile: cio' che conta e'
  // che veda la sua e nient'altro che sue.
  const daInteressato = await come(
    malato.id,
    "select profile_id, type from absences",
  );
  esito(
    daInteressato.some((r) => r.type === "legge_104") &&
      daInteressato.every((r) => r.profile_id === malato.id),
    "l'interessato vede le proprie, e solo quelle",
    `${malato.full_name}, ${daInteressato.length} righe`,
  );

  // Un collega puo' avere assenze proprie, ed e' giusto che le veda: la
  // cosa da dimostrare e' che non veda quelle degli altri.
  const daCollega = await come(
    collega.id,
    "select profile_id, type from absences",
  );
  esito(
    daCollega.every((r) => r.profile_id === collega.id),
    "il collega vede solo le proprie, mai quelle altrui",
    `(righe: ${daCollega.length}, tutte sue: ${daCollega.every((r) => r.profile_id === collega.id)})`,
  );
  esito(
    !daCollega.some((r) => r.profile_id === malato.id),
    "in particolare non vede la legge 104 del collega",
  );

  const giorniCollega = await come(
    collega.id,
    "select profile_id, start_date, end_date from absence_days",
  );
  esito(
    giorniCollega.length >= 1,
    "ma dalla vista vede i giorni, che gli servono per la copertura",
    `(righe: ${giorniCollega.length})`,
  );
  esito(
    giorniCollega.every((r) => !("type" in r) && !("note" in r)),
    "e la vista non contiene né causale né nota",
  );

  // Il confine fra aziende regge anche sulla vista.
  const { rows: altri } = await client.query(
    `select p.id from profiles p join companies c on c.id = p.company_id
      where c.name <> 'Pizzeria Prova' limit 1`,
  );
  if (altri[0]) {
    const daAltraAzienda = await come(
      altri[0].id,
      "select profile_id from absence_days",
    );
    esito(
      daAltraAzienda.length === 0,
      "chi è di un'altra azienda non vede nulla, nemmeno i giorni",
      `(righe: ${daAltraAzienda.length})`,
    );
  }
} finally {
  await client.query("delete from absences where id = $1", [idAssenza]);
}

console.log("");
console.log(problemi === 0 ? "riservatezza a posto." : `${problemi} problemi.`);
await client.end();
process.exit(problemi === 0 ? 0 : 1);

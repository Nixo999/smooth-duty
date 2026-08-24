/**
 * Crea l'azienda Mediaworld e ci carica dentro un foglio orari reale.
 *
 * Fa in una volta quello che dall'app si farebbe in tre passaggi: reparti
 * dalla colonna AdL, persone senza accesso, e i turni letti dal file. Usa lo
 * stesso lettore dell'importazione, quindi se qui torna, torna anche di là.
 *
 *   node --import ./scripts/alias.mjs --env-file=.env.local \
 *     scripts/carica-mediaworld.mjs "C:/percorso/Orari.xlsx"
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readSpreadsheet } from "../src/lib/import/grid.ts";
import { parseGrid } from "../src/lib/import/parse.ts";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FILE = process.argv[2];
const AZIENDA = "Mediaworld";
// La password del responsabile arriva da fuori: scriverla qui vorrebbe dire
// pubblicarla insieme al codice.
const CAPO = {
  nome: "Responsabile Limbiate",
  email: process.env.TURNI_CAPO_EMAIL ?? "capo@mediaworld.it",
  password: process.env.TURNI_CAPO_PASSWORD,
};

if (!FILE) throw new Error("Manca il percorso del file.");
if (!CAPO.password || CAPO.password.length < 5) {
  throw new Error(
    "Manca TURNI_CAPO_PASSWORD (almeno 5 caratteri): la password del " +
      "responsabile si passa da fuori, non si scrive nel codice.",
  );
}

const h = {
  apikey: CHIAVE,
  Authorization: `Bearer ${CHIAVE}`,
  "Content-Type": "application/json",
};

async function api(percorso, opzioni = {}) {
  const r = await fetch(`${URL_BASE}${percorso}`, {
    ...opzioni,
    headers: { ...h, ...(opzioni.headers ?? {}) },
  });
  const testo = await r.text();
  if (!r.ok) throw new Error(`${percorso} -> ${r.status} ${testo.slice(0, 300)}`);
  return testo ? JSON.parse(testo) : null;
}
const crea = (corpo) => ({
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify(corpo),
});

/* ---------------------------------------------------------- il foglio -- */

const buffer = await readFile(FILE);
const { grid, sheetName, sheetNames } = await readSpreadsheet(
  new File([buffer], basename(FILE)),
);
const letto = parseGrid(grid, sheetName, sheetNames);

console.log(`file    : ${basename(FILE)}`);
console.log(`giorni  : ${letto.days[0]} -> ${letto.days[letto.days.length - 1]}`);
console.log(`persone : ${letto.people.length}`);
console.log(`turni   : ${letto.people.reduce((n, p) => n + p.shifts.length, 0)}`);

const mismatch = letto.people.filter((p) => p.mismatches.length > 0);
if (mismatch.length > 0) {
  console.log("");
  console.log("ATTENZIONE, ore che non tornano con la colonna TOT del file:");
  for (const p of mismatch) {
    for (const m of p.mismatches) {
      console.log(
        `  ${p.fullName}, ${m.date}: nel file ${m.dichiarato}h, calcolate ${m.calcolato}h`,
      );
    }
  }
}

/* --------------------------------------------------------- l'azienda --- */

let [azienda] = await api(
  `/rest/v1/companies?select=id,name&name=eq.${encodeURIComponent(AZIENDA)}`,
);
if (!azienda) {
  [azienda] = await api("/rest/v1/companies", crea({ name: AZIENDA }));
  console.log(`\n+ azienda ${AZIENDA}`);
} else {
  console.log(`\n= azienda ${AZIENDA} c'era gia'`);
}

/* ---------------------------------------------------------- i reparti -- */

const TINTE = [25, 190, 265, 95, 320, 150, 0, 210, 45];
const sigle = [...new Set(letto.people.map((p) => p.reparto).filter(Boolean))].sort();

const esistentiRep = await api(
  `/rest/v1/departments?select=id,name&company_id=eq.${azienda.id}`,
);
const idReparto = new Map(esistentiRep.map((r) => [r.name, r.id]));

for (const [i, sigla] of sigle.entries()) {
  if (idReparto.has(sigla)) continue;
  const [r] = await api(
    "/rest/v1/departments",
    crea({
      company_id: azienda.id,
      name: sigla,
      hue: TINTE[i % TINTE.length],
      position: i,
    }),
  );
  idReparto.set(sigla, r.id);
}
console.log(`reparti : ${sigle.join(", ")}`);

/* ---------------------------------------------------------- le persone - */

const esistenti = await api(
  `/rest/v1/profiles?select=id,full_name&company_id=eq.${azienda.id}`,
);
const idPersona = new Map(esistenti.map((p) => [p.full_name, p.id]));

const daCreare = letto.people.filter((p) => !idPersona.has(p.fullName));
if (daCreare.length > 0) {
  const creati = await api(
    "/rest/v1/profiles",
    crea(
      daCreare.map((p) => ({
        company_id: azienda.id,
        user_id: null,
        full_name: p.fullName,
        email: null,
        role: "dipendente",
        must_change_password: false,
        // Nessun accesso: entrano in squadra e vanno in turno, l'email si da'
        // dopo e solo a chi usera' davvero l'app.
        department_id: p.reparto ? (idReparto.get(p.reparto) ?? null) : null,
      })),
    ),
  );
  creati.forEach((c) => idPersona.set(c.full_name, c.id));

  // I reparti in cui puo' lavorare: per ora quello del foglio. Se ne
  // aggiungono altri dalla Squadra.
  const legami = creati
    .map((c) => {
      const p = daCreare.find((x) => x.fullName === c.full_name);
      const rep = p?.reparto ? idReparto.get(p.reparto) : null;
      return rep ? { profile_id: c.id, department_id: rep } : null;
    })
    .filter(Boolean);
  if (legami.length) {
    await api("/rest/v1/profile_departments", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(legami),
    });
  }
  console.log(`persone : ${creati.length} create senza accesso`);
} else {
  console.log("persone : c'erano gia' tutte");
}

/* ------------------------------------------------------- il responsabile */

const conAccesso = await api(
  `/rest/v1/profiles?select=id&company_id=eq.${azienda.id}&role=eq.capo`,
);
if (conAccesso.length === 0) {
  let utente;
  try {
    utente = await api(
      "/auth/v1/admin/users",
      crea({
        email: CAPO.email,
        password: CAPO.password,
        email_confirm: true,
        user_metadata: { full_name: CAPO.nome },
      }),
    );
  } catch {
    const lista = await api(
      `/auth/v1/admin/users?filter=${encodeURIComponent(CAPO.email)}`,
    );
    utente = (lista.users ?? []).find((u) => u.email === CAPO.email);
  }
  await api(
    "/rest/v1/profiles",
    crea({
      company_id: azienda.id,
      user_id: utente.id,
      full_name: CAPO.nome,
      email: CAPO.email,
      role: "capo",
      must_change_password: false,
    }),
  );
  console.log(`capo    : ${CAPO.email} / ${CAPO.password}`);
} else {
  console.log("capo    : c'era gia'");
}

/* ------------------------------------------------------------- i turni - */

await api(
  `/rest/v1/shifts?company_id=eq.${azienda.id}&date=in.(${letto.days.join(",")})`,
  { method: "DELETE" },
);

const righe = letto.people.flatMap((p) =>
  p.shifts.map((s) => ({
    company_id: azienda.id,
    profile_id: idPersona.get(p.fullName) ?? null,
    date: s.date,
    start_time: s.start,
    end_time: s.end,
    title: p.reparto,
    department_id: p.reparto ? (idReparto.get(p.reparto) ?? null) : null,
  })),
);

for (let i = 0; i < righe.length; i += 500) {
  await api("/rest/v1/shifts", {
    method: "POST",
    body: JSON.stringify(righe.slice(i, i + 500)),
  });
}

console.log(`turni   : ${righe.length} importati`);

/**
 * Riempie un'azienda con reparti, squadra, regole di copertura e due settimane
 * di turni, per poter guardare l'app con dentro qualcosa che somiglia alla
 * realta'.
 *
 * Usa la chiave che scavalca le regole di accesso: e' uno strumento di
 * sviluppo, non una funzione dell'app.
 *
 *   node --env-file=.env.local scripts/dati-di-prova.mjs "Pizzeria Prova"
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZIENDA = process.argv[2] ?? "Pizzeria Prova";

// Password unica e riconoscibile: sono account finti, e doverne annotare sei
// diverse per guardare due schermate non aiuta nessuno.
const PASSWORD = "prova-turni-2026";

const intestazioni = {
  apikey: CHIAVE,
  Authorization: `Bearer ${CHIAVE}`,
  "Content-Type": "application/json",
};

async function api(percorso, opzioni = {}) {
  const r = await fetch(`${URL_BASE}${percorso}`, {
    ...opzioni,
    headers: { ...intestazioni, ...(opzioni.headers ?? {}) },
  });
  const testo = await r.text();
  if (!r.ok) throw new Error(`${percorso} -> ${r.status} ${testo.slice(0, 300)}`);
  return testo ? JSON.parse(testo) : null;
}

const creaERestituisci = (corpo) => ({
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify(corpo),
});

/* --------------------------------------------------------------- reparti */

const REPARTI = [
  { name: "Cucina", hue: 25, position: 0 },
  { name: "Sala", hue: 190, position: 1 },
  { name: "Cassa", hue: 265, position: 2 },
];

/** Le regole di copertura: in quelle ore, in quei giorni, servono N persone. */
const FASCE = [
  { reparto: "Cucina", name: "Pranzo", start_time: "11:00", end_time: "15:00", required: 2, weekdays: [1, 2, 3, 4, 5, 6, 7] },
  { reparto: "Cucina", name: "Cena", start_time: "18:00", end_time: "23:30", required: 2, weekdays: [1, 2, 3, 4, 5, 6, 7] },
  { reparto: "Sala", name: "Pranzo", start_time: "11:30", end_time: "15:00", required: 1, weekdays: [1, 2, 3, 4, 5, 6, 7] },
  { reparto: "Sala", name: "Cena", start_time: "18:00", end_time: "23:30", required: 2, weekdays: [1, 2, 3, 4, 5, 6, 7] },
  { reparto: "Cassa", name: "Giornata", start_time: "09:00", end_time: "21:00", required: 1, weekdays: [1, 2, 3, 4, 5, 6] },
];

/* --------------------------------------------------------------- squadra */

const SQUADRA = [
  { nome: "Marco Bruni", email: "marco.bruni@example.com", reparto: "Sala", ore: 24 },
  { nome: "Giulia Ferri", email: "giulia.ferri@example.com", reparto: "Cucina", ore: 40 },
  // A chiamata: nessun monte ore da rispettare.
  { nome: "Youssef Amrani", email: "youssef.amrani@example.com", reparto: "Sala", ore: null },
  { nome: "Chiara Rizzo", email: "chiara.rizzo@example.com", reparto: "Cassa", ore: 30 },
  { nome: "Davide Conti", email: "davide.conti@example.com", reparto: "Cucina", ore: 24 },
];

const CAPO = { nome: "Anna Verdi", reparto: "Cassa", ore: 40 };

/* ---------------------------------------------------------------- turni
   Un elenco per giorno della settimana, da lunedi' a domenica.
   [] significa riposo; due fasce nello stesso giorno = turno spezzato. */

const TURNI = {
  "Anna Verdi": [
    [["09:00", "15:00"]],
    [["09:00", "15:00"]],
    [],
    [["09:00", "13:00"], ["18:00", "22:00"]],
    [["09:00", "15:00"]],
    [["16:00", "23:00"]],
    [],
  ],
  "Marco Bruni": [
    [["18:00", "23:30"]],
    [["18:00", "23:30"]],
    [["18:00", "23:30"]],
    [],
    [["18:00", "23:30"]],
    [["11:30", "15:00"], ["18:00", "23:30"]],
    [["11:30", "15:00"]],
  ],
  "Giulia Ferri": [
    [["11:00", "15:00"], ["18:30", "22:30"]],
    [],
    [["11:00", "15:00"], ["18:30", "22:30"]],
    [["11:00", "15:00"]],
    [["11:00", "15:00"], ["18:30", "22:30"]],
    [["18:00", "23:00"]],
    [["11:00", "15:00"]],
  ],
  "Youssef Amrani": [
    [],
    [["12:00", "15:00"]],
    [["12:00", "15:00"], ["19:00", "23:00"]],
    [["12:00", "15:00"]],
    [["19:00", "23:30"]],
    [["19:00", "23:30"]],
    [],
  ],
  "Chiara Rizzo": [
    [["15:00", "21:00"]],
    [["15:00", "21:00"]],
    [],
    [["15:00", "21:00"]],
    [["15:00", "21:00"]],
    [["09:00", "15:00"]],
    [["09:00", "15:00"]],
  ],
  "Davide Conti": [
    [],
    [["18:00", "23:00"]],
    [["18:00", "23:00"]],
    [["18:00", "23:00"]],
    [["18:00", "23:00"]],
    // Chiusura: finisce dopo la mezzanotte, cosi' si vede come l'app lo segnala.
    [["18:00", "02:00"]],
    [],
  ],
};

// Turni senza nessuno assegnato: nel tabellone finiscono sotto "Da assegnare".
const SCOPERTI = [
  { giorno: 2, da: "18:00", a: "23:00", reparto: "Sala" },
  { giorno: 6, da: "18:00", a: "23:00", reparto: "Cucina" },
];

/* ------------------------------------------------------------------ date */

function lunediCorrente() {
  const oggi = new Date();
  const giorno = (oggi.getDay() + 6) % 7; // 0 = lunedi'
  oggi.setDate(oggi.getDate() - giorno);
  return oggi;
}

function iso(base, aggiunta) {
  const d = new Date(base);
  d.setDate(d.getDate() + aggiunta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- lavoro */

const [azienda] = await api(
  `/rest/v1/companies?select=id,name&name=eq.${encodeURIComponent(AZIENDA)}`,
);
if (!azienda) throw new Error(`Azienda "${AZIENDA}" non trovata.`);
console.log(`azienda: ${azienda.name}`);

// ---- reparti -------------------------------------------------------------
const repartiEsistenti = await api(
  `/rest/v1/departments?select=id,name&company_id=eq.${azienda.id}`,
);
const idReparto = new Map(repartiEsistenti.map((r) => [r.name, r.id]));

for (const r of REPARTI) {
  if (idReparto.has(r.name)) continue;
  const [creato] = await api(
    "/rest/v1/departments",
    creaERestituisci({ ...r, company_id: azienda.id }),
  );
  idReparto.set(r.name, creato.id);
  console.log(`  + reparto ${r.name}`);
}

// ---- persone -------------------------------------------------------------
const esistenti = await api(
  `/rest/v1/profiles?select=id,full_name,email&company_id=eq.${azienda.id}`,
);
const perNome = new Map(esistenti.map((p) => [p.full_name, p.id]));

for (const persona of SQUADRA) {
  if (!perNome.has(persona.nome)) {
    let utente;
    try {
      utente = await api("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: persona.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: persona.nome },
        }),
      });
    } catch (e) {
      // Account gia' presente da un giro precedente: lo si ritrova per email.
      const lista = await api(
        `/auth/v1/admin/users?filter=${encodeURIComponent(persona.email)}`,
      );
      utente = (lista.users ?? []).find((u) => u.email === persona.email);
      if (!utente) throw e;
    }

    await api("/rest/v1/profiles", {
      method: "POST",
      body: JSON.stringify({
        id: utente.id,
        company_id: azienda.id,
        full_name: persona.nome,
        email: persona.email,
        role: "dipendente",
        // Account dimostrativi: si entra e si guarda, senza il passaggio del
        // cambio password. Quello resta attivo per gli account veri.
        must_change_password: false,
      }),
    });
    perNome.set(persona.nome, utente.id);
    console.log(`  + ${persona.nome}`);
  }

  await api(`/rest/v1/profiles?id=eq.${perNome.get(persona.nome)}`, {
    method: "PATCH",
    body: JSON.stringify({
      department_id: idReparto.get(persona.reparto) ?? null,
      contract_hours: persona.ore,
      on_call: persona.ore === null,
    }),
  });
}

if (perNome.has(CAPO.nome)) {
  await api(`/rest/v1/profiles?id=eq.${perNome.get(CAPO.nome)}`, {
    method: "PATCH",
    body: JSON.stringify({
      department_id: idReparto.get(CAPO.reparto) ?? null,
      contract_hours: CAPO.ore,
      on_call: false,
    }),
  });
}

// ---- fasce di copertura --------------------------------------------------
await api(`/rest/v1/coverage_bands?company_id=eq.${azienda.id}`, { method: "DELETE" });
await api("/rest/v1/coverage_bands", {
  method: "POST",
  body: JSON.stringify(
    FASCE.map((f, i) => ({
      company_id: azienda.id,
      department_id: idReparto.get(f.reparto),
      name: f.name,
      start_time: f.start_time,
      end_time: f.end_time,
      required: f.required,
      weekdays: f.weekdays,
      position: i,
    })),
  ),
});
console.log(`  + ${FASCE.length} fasce di copertura`);

// ---- turni ---------------------------------------------------------------
const lunedi = lunediCorrente();
const giorni = [];
for (let settimana = 0; settimana < 2; settimana++) {
  for (let g = 0; g < 7; g++) giorni.push(iso(lunedi, settimana * 7 + g));
}

// Ripartire pulito: lo script si puo' rilanciare senza raddoppiare i turni.
const cancellati = await api(
  `/rest/v1/shifts?company_id=eq.${azienda.id}&date=in.(${giorni.join(",")})`,
  { method: "DELETE", headers: { Prefer: "return=representation" } },
);
if (cancellati.length) console.log(`  - ${cancellati.length} turni rimossi`);

const reparto = new Map(SQUADRA.map((p) => [p.nome, p.reparto]));
reparto.set(CAPO.nome, CAPO.reparto);

const righe = [];
for (let settimana = 0; settimana < 2; settimana++) {
  for (const [nome, piano] of Object.entries(TURNI)) {
    const profilo = perNome.get(nome);
    if (!profilo) continue;
    piano.forEach((fasce, g) => {
      for (const [da, a] of fasce) {
        righe.push({
          company_id: azienda.id,
          profile_id: profilo,
          date: iso(lunedi, settimana * 7 + g),
          start_time: da,
          end_time: a,
          title: reparto.get(nome) ?? null,
          // Null: vale il reparto della persona. La chiave c'e' comunque
          // perche' in un inserimento multiplo PostgREST pretende che tutte
          // le righe abbiano esattamente le stesse colonne.
          department_id: null,
        });
      }
    });
  }
  for (const s of SCOPERTI) {
    righe.push({
      company_id: azienda.id,
      profile_id: null,
      date: iso(lunedi, settimana * 7 + s.giorno),
      start_time: s.da,
      end_time: s.a,
      title: s.reparto,
      department_id: idReparto.get(s.reparto) ?? null,
    });
  }
}

await api("/rest/v1/shifts", { method: "POST", body: JSON.stringify(righe) });

// ---- assenze -------------------------------------------------------------
// Una aperta e una chiusa: la prima fa comparire i buchi in Supervisione, la
// seconda mostra come il prospetto separa le causali.
await api(`/rest/v1/absences?company_id=eq.${azienda.id}`, { method: "DELETE" });

const assenze = [];
if (perNome.has("Giulia Ferri")) {
  assenze.push({
    company_id: azienda.id,
    profile_id: perNome.get("Giulia Ferri"),
    type: "malattia",
    start_date: iso(lunedi, 2),
    end_date: null,
    note: "Certificato fino a venerdì, poi si vede.",
  });
}
if (perNome.has("Davide Conti")) {
  assenze.push({
    company_id: azienda.id,
    profile_id: perNome.get("Davide Conti"),
    type: "legge_104",
    start_date: iso(lunedi, 1),
    end_date: iso(lunedi, 1),
    note: null,
  });
}
if (assenze.length) {
  await api("/rest/v1/absences", { method: "POST", body: JSON.stringify(assenze) });
  console.log(`  + ${assenze.length} assenze`);
}

console.log("");
console.log(`turni inseriti  : ${righe.length}`);
console.log(`settimane       : ${giorni[0]} -> ${giorni[13]}`);
console.log(`password comune : ${PASSWORD}`);

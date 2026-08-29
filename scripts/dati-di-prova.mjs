/**
 * Riempie un'azienda con reparti, squadra, regole di copertura e due settimane
 * di turni, per poter guardare l'app con dentro qualcosa che somiglia alla
 * realta'.
 *
 * Non e' un riempitivo: e' il materiale della dimostrazione. Per questo
 * l'azienda ha un nome vero, la squadra e' di quattordici persone — sotto la
 * dozzina un cliente si chiede se il prodotto sia fatto per lui — la settimana
 * in corso nasce **pubblicata** e la prossima no, e ci sono gia' dentro un
 * rifiuto aperto, una risposta alla settimana e due richieste di ferie: sono
 * esattamente le cose che le schermate servono a mostrare, e senza di quelle
 * si vedono soltanto zeri.
 *
 * Usa la chiave che scavalca le regole di accesso: e' uno strumento di
 * sviluppo, non una funzione dell'app.
 *
 *   node --env-file=.env.local scripts/dati-di-prova.mjs "Osteria del Borgo"
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AZIENDA = process.argv[2] ?? "Osteria del Borgo";

// Password unica per tutti gli account dimostrativi: sono finti, e doverne
// annotare dieci diverse per guardare due schermate non aiuta nessuno. Arriva
// da fuori e non ha un valore di ripiego: una password scritta nel codice
// finisce su GitHub, e da li' non si toglie piu'.
const PASSWORD = process.env.TURNI_DEMO_PASSWORD;
if (!PASSWORD || PASSWORD.length < 5) {
  console.error(
    "Manca TURNI_DEMO_PASSWORD (almeno 5 caratteri).\n" +
      "  TURNI_DEMO_PASSWORD=... node --env-file=.env.local scripts/dati-di-prova.mjs",
  );
  process.exit(1);
}

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

/* --------------------------------------------------------------- squadra
   Quattordici persone in tutto, capo compreso. Tre non hanno un accesso
   (`email: null`): in una squadra vera meta' non apre mai l'app, va in turno
   lo stesso, e vederlo nel tabellone e' meta' della risposta all'obiezione
   «i miei non sapranno usarlo». */

const SQUADRA = [
  // --- Cucina
  { nome: "Giulia Ferri", email: "giulia.ferri@example.com", reparto: "Cucina", ore: 40 },
  { nome: "Karim Belhadj", email: "karim.belhadj@example.com", reparto: "Cucina", ore: 40 },
  { nome: "Ilaria Moretti", email: "ilaria.moretti@example.com", reparto: "Cucina", ore: 30 },
  { nome: "Davide Conti", email: "davide.conti@example.com", reparto: "Cucina", ore: 24 },
  { nome: "Sara Fontana", email: null, reparto: "Cucina", ore: 20 },
  // --- Sala
  { nome: "Marco Bruni", email: "marco.bruni@example.com", reparto: "Sala", ore: 24 },
  { nome: "Luca Gallo", email: "luca.gallo@example.com", reparto: "Sala", ore: 40 },
  { nome: "Elena Ricci", email: "elena.ricci@example.com", reparto: "Sala", ore: 30 },
  { nome: "Paolo Serra", email: null, reparto: "Sala", ore: 24 },
  // A chiamata: nessun numero di ore a settimana da rispettare.
  { nome: "Youssef Amrani", email: "youssef.amrani@example.com", reparto: "Sala", ore: null },
  { nome: "Nadia Esposito", email: "nadia.esposito@example.com", reparto: "Sala", ore: null },
  // --- Cassa
  { nome: "Chiara Rizzo", email: "chiara.rizzo@example.com", reparto: "Cassa", ore: 30 },
  { nome: "Federico Bianchi", email: null, reparto: "Cassa", ore: 20 },
];

const CAPO = { nome: "Anna Verdi", reparto: "Cassa", ore: 40 };

/* ---------------------------------------------------------------- turni
   Un elenco per giorno della settimana, da lunedi' a domenica.
   RIP significa riposo; due fasce nello stesso giorno = turno spezzato.
   Le sigle tengono la tabella leggibile: con quattordici righe scritte per
   esteso non si vede piu' chi copre cosa. */

const RIP = [];
const CU_PRANZO = [["11:00", "15:00"]];
const CU_CENA = [["18:00", "23:30"]];
const CU_SPEZZATO = [["11:00", "15:00"], ["18:30", "22:30"]];
// Chiusura: finisce dopo la mezzanotte, cosi' si vede come l'app lo segnala.
const CU_CHIUSURA = [["18:00", "02:00"]];
const SA_PRANZO = [["11:30", "15:00"]];
const SA_CENA = [["18:00", "23:30"]];
const SA_SPEZZATO = [["11:30", "15:00"], ["18:00", "23:30"]];
const CA_MATTINA = [["09:00", "15:00"]];
const CA_POMERIGGIO = [["15:00", "21:00"]];

const TURNI = {
  // --- Cassa
  "Anna Verdi": [
    CA_MATTINA,
    CA_MATTINA,
    RIP,
    [["09:00", "13:00"], ["18:00", "22:00"]],
    CA_MATTINA,
    [["16:00", "23:00"]],
    RIP,
  ],
  "Chiara Rizzo": [
    CA_POMERIGGIO, CA_POMERIGGIO, CA_POMERIGGIO, CA_POMERIGGIO, CA_POMERIGGIO, RIP, RIP,
  ],
  "Federico Bianchi": [RIP, RIP, CA_MATTINA, RIP, CA_POMERIGGIO, CA_MATTINA, RIP],
  // --- Cucina
  "Giulia Ferri": [
    CU_SPEZZATO, RIP, CU_SPEZZATO, CU_PRANZO, CU_SPEZZATO, CU_CENA, CU_PRANZO,
  ],
  "Karim Belhadj": [
    CU_CENA, CU_SPEZZATO, CU_CENA, CU_SPEZZATO, CU_CENA, CU_SPEZZATO, RIP,
  ],
  "Ilaria Moretti": [
    CU_PRANZO, CU_PRANZO, RIP, CU_PRANZO, CU_PRANZO, CU_SPEZZATO, CU_PRANZO,
  ],
  // Sopra le sue ore: e' la riga che fa comparire gli straordinari.
  "Davide Conti": [RIP, CU_CENA, CU_CENA, CU_CENA, CU_CENA, CU_CHIUSURA, RIP],
  // Sotto le sue ore: e' la riga che fa comparire «chi sta sotto».
  "Sara Fontana": [CU_PRANZO, RIP, CU_PRANZO, RIP, CU_PRANZO, CU_PRANZO, RIP],
  // --- Sala
  "Marco Bruni": [SA_CENA, RIP, SA_CENA, RIP, SA_CENA, SA_SPEZZATO, RIP],
  "Luca Gallo": [
    SA_PRANZO, SA_CENA, SA_SPEZZATO, SA_CENA, SA_SPEZZATO, SA_CENA, SA_PRANZO,
  ],
  "Elena Ricci": [SA_CENA, SA_PRANZO, SA_PRANZO, SA_CENA, SA_PRANZO, RIP, SA_CENA],
  "Paolo Serra": [RIP, SA_CENA, RIP, SA_CENA, RIP, SA_CENA, SA_CENA],
  "Youssef Amrani": [RIP, SA_PRANZO, SA_SPEZZATO, SA_PRANZO, SA_CENA, SA_CENA, RIP],
  "Nadia Esposito": [RIP, RIP, RIP, RIP, SA_CENA, SA_CENA, SA_PRANZO],
};

// Turni senza nessuno assegnato: nel tabellone finiscono sotto "Scoperto".
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

const adesso = () => new Date().toISOString();

/* ---------------------------------------------------------------- lavoro */

let [azienda] = await api(
  `/rest/v1/companies?select=id,name&name=eq.${encodeURIComponent(AZIENDA)}`,
);
if (!azienda) {
  // Il nome dell'azienda e' quello che l'app stampa in alto a sinistra per
  // tutta la dimostrazione: crearla qui evita che la prima schermata dipenda
  // da un passaggio a mano che nessuno si ricorda di fare.
  [azienda] = await api("/rest/v1/companies", creaERestituisci({ name: AZIENDA }));
  console.log(`azienda creata: ${azienda.name}`);
} else {
  console.log(`azienda: ${azienda.name}`);
}

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
    // Senza indirizzo la persona esiste e va in turno, ma nell'app non entra:
    // e' il caso di meta' di una squadra vera.
    let utente = null;
    if (persona.email) {
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
    }

    // `user_id`, non `id`: da quando una persona puo' esistere senza account
    // le due chiavi sono separate, e l'app riconosce chi sta guardando lo
    // schermo dal `user_id`. Scrivendolo nell'`id`, come si faceva prima,
    // l'account veniva creato ma non entrava piu' in nessuna schermata.
    const [profilo] = await api(
      "/rest/v1/profiles",
      creaERestituisci({
        company_id: azienda.id,
        user_id: utente?.id ?? null,
        full_name: persona.nome,
        email: persona.email,
        role: "dipendente",
        // Account dimostrativi: si entra e si guarda, senza il passaggio del
        // cambio password. Quello resta attivo per gli account veri.
        must_change_password: false,
      }),
    );
    perNome.set(persona.nome, profilo.id);
    console.log(`  + ${persona.nome}${persona.email ? "" : " (senza accesso)"}`);
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
} else {
  // Il responsabile non lo crea questo script: e' l'account con cui si fa
  // vedere l'app, e si crea dal pannello dell'amministratore.
  console.log(`  ! ${CAPO.nome} non c'e': i suoi turni restano fuori`);
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
// I messaggi e le risposte vanno via prima dei turni a cui puntano.
await api(`/rest/v1/shift_messages?company_id=eq.${azienda.id}`, { method: "DELETE" });
await api(`/rest/v1/week_requests?company_id=eq.${azienda.id}`, { method: "DELETE" });
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

const turniCreati = await api("/rest/v1/shifts", creaERestituisci(righe));

// ---- la settimana in corso e' pubblicata ---------------------------------
// La prossima no, ed e' voluto: le due righe insieme sono la frase che apre
// la dimostrazione — questa la vedono i dipendenti, quella dopo la vedi solo tu.
await api(`/rest/v1/published_weeks?company_id=eq.${azienda.id}`, { method: "DELETE" });
await api("/rest/v1/published_weeks", {
  method: "POST",
  body: JSON.stringify({ company_id: azienda.id, monday: iso(lunedi, 0) }),
});
console.log(`  + settimana ${iso(lunedi, 0)} pubblicata (la prossima no)`);

// ---- un rifiuto aperto ---------------------------------------------------
// Marco Bruni si e' visto spostare il turno del venerdi' dal pranzo alla cena
// e ha detto di no. Il turno resta a schermo com'e' adesso, col rifiuto
// attaccato: e' esattamente lo stato che il responsabile deve trovare.
const venerdi = iso(lunedi, 4);
const turnoRifiutato = turniCreati.find(
  (t) =>
    t.profile_id === perNome.get("Marco Bruni") &&
    t.date === venerdi &&
    String(t.start_time).startsWith("18:00"),
);
if (turnoRifiutato) {
  const motivazione = "Il venerdì sera non riesco, avevo preso un impegno.";
  const comEra = {
    profile_id: turnoRifiutato.profile_id,
    date: venerdi,
    start_time: "11:30",
    end_time: "15:00",
    department_id: turnoRifiutato.department_id,
    title: turnoRifiutato.title,
    location: null,
    notes: null,
  };
  const comE = {
    profile_id: turnoRifiutato.profile_id,
    date: venerdi,
    start_time: "18:00",
    end_time: "23:30",
    department_id: turnoRifiutato.department_id,
    title: turnoRifiutato.title,
    location: null,
    notes: null,
  };
  await api(`/rest/v1/shifts?id=eq.${turnoRifiutato.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      richiede_conferma: "modifica",
      rifiutato_at: adesso(),
      nota_rifiuto: motivazione,
      stato_prima: comEra,
    }),
  });
  await api("/rest/v1/shift_messages", {
    method: "POST",
    body: JSON.stringify({
      company_id: azienda.id,
      profile_id: turnoRifiutato.profile_id,
      shift_id: turnoRifiutato.id,
      motivo: "modifica",
      nota: motivazione,
      giorno: venerdi,
      turno_prima: comEra,
      turno_dopo: comE,
    }),
  });
  console.log("  + 1 rifiuto da leggere (Marco Bruni, venerdì)");
}

// ---- una risposta alla settimana -----------------------------------------
// Luca Gallo ha accettato, ma con un ritocco allegato: e' il caso che spiega
// da solo perche' la nota e' una colonna sola.
if (perNome.has("Luca Gallo")) {
  await api("/rest/v1/week_requests", {
    method: "POST",
    body: JSON.stringify({
      company_id: azienda.id,
      profile_id: perNome.get("Luca Gallo"),
      monday: iso(lunedi, 0),
      motivo: "straordinario",
      // In minuti, congelati alla nascita della domanda: 41h30 previste
      // contro 40h di contratto.
      minuti_previsti: 2490,
      minuti_contratto: 2400,
      stato: "accettata",
      nota: "Va bene, ma giovedì se possibile smetto alle 22.",
      deciso_at: adesso(),
    }),
  });
  console.log("  + 1 risposta alla settimana da leggere (Luca Gallo)");
}

// ---- assenze -------------------------------------------------------------
// Una aperta e una chiusa: la prima fa comparire i buchi in Supervisione, la
// seconda mostra come il prospetto separa i motivi.
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

// ---- due richieste di ferie, ancora da approvare -------------------------
await api(`/rest/v1/vacation_requests?company_id=eq.${azienda.id}`, { method: "DELETE" });

const FERIE = [
  {
    chi: "Chiara Rizzo",
    type: "ferie",
    start_date: iso(lunedi, 17),
    end_date: iso(lunedi, 21),
    note: "Matrimonio di mia sorella, il volo è già preso.",
  },
  {
    chi: "Karim Belhadj",
    type: "visita_medica",
    start_date: iso(lunedi, 9),
    end_date: iso(lunedi, 9),
    note: "Ho una visita, torno per la cena.",
  },
];
const ferie = FERIE.filter((f) => perNome.has(f.chi));

if (ferie.length) {
  await api("/rest/v1/vacation_requests", {
    method: "POST",
    body: JSON.stringify(
      ferie.map((f) => ({
        company_id: azienda.id,
        profile_id: perNome.get(f.chi),
        type: f.type,
        start_date: f.start_date,
        end_date: f.end_date,
        note: f.note,
        status: "richiesta",
      })),
    ),
  });
  console.log(`  + ${ferie.length} richieste da approvare`);
}

console.log("");
console.log(`persone         : ${perNome.size}`);
console.log(`turni inseriti  : ${righe.length}`);
console.log(`settimane       : ${giorni[0]} -> ${giorni[13]}`);
console.log(`pubblicata      : ${iso(lunedi, 0)} (la seconda no, di proposito)`);
console.log(`password comune : ${PASSWORD}`);

/** Controlli sul conto della settimana che regge la schermata «Oggi».
 *    node --import ./scripts/alias.mjs scripts/prova-oggi.mjs
 *
 *  L'ultimo gruppo e' il piu' importante: verifica che «chi sta sotto» qui
 *  dica le stesse persone e gli stessi minuti di `chiStaSottoContratto`, che
 *  e' il conto che ferma la pubblicazione. Due schermate che rispondono
 *  diverso alla stessa domanda sono il bug che questa schermata esiste per
 *  togliere, non uno da aggiungere. */
import { bilancioSettimana } from "../src/lib/oggi.ts";
import { chiStaSottoContratto } from "../src/lib/pubblicazione.ts";

let errori = 0;
const uguale = (titolo, atteso, ottenuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (!ok) errori++;
  console.log(`${ok ? "ok  " : "NO  "}${titolo}`);
  if (!ok) {
    console.log(`      atteso   ${JSON.stringify(atteso)}`);
    console.log(`      ottenuto ${JSON.stringify(ottenuto)}`);
  }
};

const GIORNI = [
  "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
  "2026-08-28", "2026-08-29", "2026-08-30",
];

const persona = (nome, o = {}) => ({
  id: o.id ?? nome.toLowerCase(),
  full_name: nome,
  contract_hours: o.ore === undefined ? 40 : o.ore,
  on_call: o.chiamata ?? false,
});
const turno = (chi, giorno, da, a, rifiutato = null) => ({
  profile_id: chi, date: giorno, start_time: da, end_time: a,
  rifiutato_at: rifiutato,
});
/** N turni da 8 ore, uno per giorno, a partire da lunedi'. */
const giornate = (chi, quante) =>
  GIORNI.slice(0, quante).map((g) => turno(chi, g, "09:00:00", "17:00:00"));

const assenza = (chi, da, a = null) => ({
  id: `a-${chi}`, profile_id: chi, type: "malattia", start_date: da, end_date: a,
});

const conto = (o) =>
  bilancioSettimana({
    persone: o.persone,
    turni: o.turni ?? [],
    assenze: o.assenze ?? [],
    giorni: GIORNI,
  });

/* --------------------------------------------------- il numero grande --- */

uguale(
  "quaranta ore fatte su quaranta dovute",
  [2400, 2400],
  (() => { const b = conto({ persone: [persona("Anna")], turni: giornate("anna", 5) });
    return [b.effettivi, b.dovuti]; })(),
);

uguale(
  "assente da mercoledi': le ore dovute scendono con i giorni",
  [960, 685],
  (() => {
    const b = conto({
      persone: [persona("Anna")],
      turni: giornate("anna", 5),
      assenze: [assenza("anna", "2026-08-26", "2026-08-30")],
    });
    // Lunedi' e martedi' lavorati (960 min), mercoledi'-domenica assente:
    // dovuti = 40h x 2 giorni / 7 = 685 minuti.
    return [b.effettivi, b.dovuti];
  })(),
);

uguale(
  "il turno rifiutato non porta ore, come dappertutto",
  [1920, 2400],
  (() => {
    const t = giornate("anna", 5);
    t[4] = turno("anna", GIORNI[4], "09:00:00", "17:00:00", "2026-08-24T10:00:00Z");
    const b = conto({ persone: [persona("Anna")], turni: t });
    return [b.effettivi, b.dovuti];
  })(),
);

uguale(
  "nessuno ha ore da contratto: niente righe, niente divisione per zero",
  [0, 0, 0, 3840],
  (() => {
    const b = conto({
      persone: [persona("Anna", { ore: null }), persona("Bea", { chiamata: true, ore: null })],
      turni: [...giornate("anna", 5), ...giornate("bea", 3)],
    });
    return [b.righe.length, b.dovuti, b.effettivi, b.fuoriContratto];
  })(),
);

uguale(
  "i turni di nessuno restano fuori dai conti delle persone",
  [0, 480],
  (() => {
    const b = conto({
      persone: [persona("Anna")],
      turni: [turno(null, GIORNI[0], "09:00:00", "17:00:00")],
    });
    return [b.effettivi, b.scoperti];
  })(),
);

/* ------------------------------------------------------ sotto e sopra --- */

const scarti = (b) => [
  b.sotto.map((r) => `${r.nome} ${r.scarto}`),
  b.sopra.map((r) => `${r.nome} ${r.scarto}`),
];

uguale(
  "chi manca e chi eccede, ciascuno dalla sua parte",
  [["Carla -960", "Anna -480"], ["Bea 480"]],
  scarti(
    conto({
      persone: [persona("Anna"), persona("Bea"), persona("Carla")],
      turni: [...giornate("anna", 4), ...giornate("bea", 6), ...giornate("carla", 3)],
    }),
  ),
);

uguale(
  "chi e' in pari non compare da nessuna delle due parti",
  [[], []],
  scarti(conto({ persone: [persona("Anna")], turni: giornate("anna", 5) })),
);

uguale(
  "assente tutta la settimana: non deve niente e non compare",
  [[], []],
  scarti(
    conto({
      persone: [persona("Anna")],
      assenze: [assenza("anna", "2026-08-01")],
    }),
  ),
);

uguale(
  "chi e' a chiamata non ha un monte ore da sfondare",
  [[], []],
  scarti(
    conto({
      persone: [persona("Bea", { chiamata: true, ore: null })],
      turni: giornate("bea", 7),
    }),
  ),
);

/* ----------------------------------- lo stesso conto della pubblicazione */

const casi = [
  {
    titolo: "settimana piena",
    persone: [persona("Anna"), persona("Bea")],
    turni: [...giornate("anna", 5), ...giornate("bea", 5)],
    assenze: [],
  },
  {
    titolo: "qualcuno sotto, qualcuno sopra",
    persone: [persona("Anna"), persona("Bea"), persona("Carla", { ore: 20 })],
    turni: [...giornate("anna", 3), ...giornate("bea", 6), ...giornate("carla", 2)],
    assenze: [],
  },
  {
    titolo: "con un'assenza a meta' settimana",
    persone: [persona("Anna"), persona("Bea")],
    turni: [...giornate("anna", 2), ...giornate("bea", 5)],
    assenze: [assenza("anna", "2026-08-26", "2026-08-30")],
  },
  {
    titolo: "con un rifiuto ancora aperto",
    persone: [persona("Anna")],
    turni: [
      ...giornate("anna", 4),
      turno("anna", GIORNI[4], "09:00:00", "17:00:00", "2026-08-24T10:00:00Z"),
    ],
    assenze: [],
  },
  {
    titolo: "a chiamata e senza ore in scheda",
    persone: [persona("Bea", { chiamata: true, ore: null }), persona("Dario", { ore: null })],
    turni: [...giornate("bea", 2), ...giornate("dario", 1)],
    assenze: [],
  },
];

for (const caso of casi) {
  const dati = { persone: caso.persone, turni: caso.turni, assenze: caso.assenze, giorni: GIORNI };
  uguale(
    `stesso elenco della pubblicazione — ${caso.titolo}`,
    chiStaSottoContratto(dati).map((r) => `${r.nome} ${r.mancano} su ${r.dovuti}`),
    bilancioSettimana(dati).sotto.map((r) => `${r.nome} ${-r.scarto} su ${r.dovuti}`),
  );
}

console.log(errori === 0 ? "\ntutto a posto" : `\n${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

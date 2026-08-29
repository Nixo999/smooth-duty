/** Controlli sulla regola che impedisce di pubblicare una settimana in cui
 *  qualcuno sta sotto le sue ore da contratto.
 *    node --import ./scripts/alias.mjs scripts/prova-pubblicazione.mjs */
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

const chiManca = (o) =>
  chiStaSottoContratto({
    persone: o.persone,
    turni: o.turni ?? [],
    assenze: o.assenze ?? [],
    giorni: GIORNI,
  }).map((x) => `${x.nome}: mancano ${x.mancano} min su ${x.dovuti}`);

/* ------------------------------------------------------------ il conto --- */

uguale(
  "quaranta ore fatte: non manca niente",
  [],
  chiManca({ persone: [persona("Anna")], turni: giornate("anna", 5) }),
);

uguale(
  "una giornata in meno: mancano otto ore",
  ["Anna: mancano 480 min su 2400"],
  chiManca({ persone: [persona("Anna")], turni: giornate("anna", 4) }),
);

uguale(
  "nessun turno: manca tutto il contratto",
  ["Anna: mancano 2400 min su 2400"],
  chiManca({ persone: [persona("Anna")] }),
);

uguale(
  "piu' ore del contratto non e' un problema di questa regola",
  [],
  chiManca({ persone: [persona("Anna")], turni: giornate("anna", 6) }),
);

/* ----------------------------------------------------------- gli esclusi */

uguale(
  "chi e' a chiamata non ha un monte ore da rispettare",
  [],
  chiManca({ persone: [persona("Bruno", { ore: null, chiamata: true })] }),
);

uguale(
  "e nemmeno chi non ha ore scritte in scheda",
  [],
  chiManca({ persone: [persona("Bruno", { ore: null })] }),
);

/* -------------------------------------------------------------- assenze */

uguale(
  "assente tutta la settimana: non deve niente",
  [],
  chiManca({
    persone: [persona("Anna")],
    assenze: [assenza("anna", "2026-08-20")],
  }),
);

uguale(
  "assente da mercoledi': deve solo i due giorni in cui c'era",
  [],
  chiManca({
    persone: [persona("Anna")],
    // Lunedi' e martedi' lavorati: 16 ore. Dovute 40 × 2/7 = 685 min.
    turni: giornate("anna", 2),
    assenze: [assenza("anna", "2026-08-26")],
  }),
);

uguale(
  "assente da mercoledi' ma senza aver lavorato i primi due giorni",
  ["Anna: mancano 685 min su 685"],
  chiManca({
    persone: [persona("Anna")],
    assenze: [assenza("anna", "2026-08-26")],
  }),
);

uguale(
  "i turni scritti su un giorno di assenza non contano",
  ["Anna: mancano 685 min su 685"],
  chiManca({
    persone: [persona("Anna")],
    // Due turni, ma tutti e due in giorni in cui e' assente.
    turni: [turno("anna", "2026-08-27", "09:00:00", "17:00:00"),
            turno("anna", "2026-08-28", "09:00:00", "17:00:00")],
    assenze: [assenza("anna", "2026-08-26")],
  }),
);

/* -------------------------------------------------------------- rifiuti */

uguale(
  "un turno rifiutato non conta fra le ore fatte: quelle ore mancano",
  ["Anna: mancano 480 min su 2400"],
  chiManca({
    persone: [persona("Anna")],
    // Cinque giornate da otto ore, ma il giovedi' e' stato rifiutato.
    turni: [
      ...giornate("anna", 3),
      turno("anna", "2026-08-27", "09:00:00", "17:00:00", "2026-08-25T10:00:00Z"),
      turno("anna", "2026-08-28", "09:00:00", "17:00:00"),
    ],
  }),
);

/* --------------------------------------------------------------- ordine */

uguale(
  "chi ne ha di meno viene prima: e' il primo a cui mettere mano",
  ["Carla: mancano 2400 min su 2400", "Anna: mancano 480 min su 2400"],
  chiManca({
    persone: [persona("Anna"), persona("Carla")],
    turni: giornate("anna", 4),
  }),
);

/* ------------------------------------------------------- mezzanotte --- */

uguale(
  "un turno di notte conta le sue ore, non zero",
  ["Anna: mancano 1440 min su 2400"],
  chiManca({
    persone: [persona("Anna")],
    // 22:00–06:00 = 8 ore, per due notti.
    turni: [turno("anna", "2026-08-24", "22:00:00", "06:00:00"),
            turno("anna", "2026-08-25", "22:00:00", "06:00:00")],
  }),
);

console.log(errori === 0 ? "\ntutto a posto" : `\n${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

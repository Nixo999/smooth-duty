/** Controlli sul motore della pagina Supervisione.
 *    node --import ./scripts/alias.mjs scripts/prova-copertura.mjs */
import {
  buchi as calcolaBuchi,
  copertura,
  fasceDelGiorno,
  giornoIso,
  intervalloVisibile,
  oraDa,
  segmentiDelGiorno,
} from "../src/lib/supervisione/copertura.ts";
import { assenzaDelGiorno } from "../src/lib/assenze.ts";

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

const PERSONE = [
  { id: "p1", full_name: "Marta", department_id: "cucina" },
  { id: "p2", full_name: "Mirko", department_id: "cucina" },
  { id: "p3", full_name: "Fabio", department_id: "sala" },
];

const turno = (id, profile_id, date, start_time, end_time, department_id = null) => ({
  id, profile_id, date, start_time, end_time, title: null, department_id,
});

/* ------------------------------------------------- giorni della settimana */

uguale("17 agosto 2026 e' lunedi (1)", 1, giornoIso("2026-08-17"));
uguale("22 agosto 2026 e' sabato (6)", 6, giornoIso("2026-08-22"));
uguale("23 agosto 2026 e' domenica (7)", 7, giornoIso("2026-08-23"));

/* ------------------------------------------------------ turno di notte --- */

const notte = [turno("t1", "p1", "2026-08-22", "18:00:00", "02:00:00")];

const sabato = segmentiDelGiorno(notte, PERSONE, "2026-08-22", "2026-08-21");
uguale(
  "notte 18-02: sabato si vede 18:00-24:00 e prosegue",
  [{ da: 1080, a: 1440, daPrima: false, finoADopo: true }],
  sabato.map(({ da, a, daPrima, finoADopo }) => ({ da, a, daPrima, finoADopo })),
);

const domenica = segmentiDelGiorno(notte, PERSONE, "2026-08-23", "2026-08-22");
uguale(
  "notte 18-02: domenica si vede 00:00-02:00, veniva da prima",
  [{ da: 0, a: 120, daPrima: true, finoADopo: false }],
  domenica.map(({ da, a, daPrima, finoADopo }) => ({ da, a, daPrima, finoADopo })),
);

const lunedi = segmentiDelGiorno(notte, PERSONE, "2026-08-24", "2026-08-23");
uguale("notte 18-02: due giorni dopo non si vede piu'", 0, lunedi.length);

/* ------------------------------------------------- reparto del turno ----- */

const copre = segmentiDelGiorno(
  [turno("t2", "p1", "2026-08-22", "09:00:00", "13:00:00", "sala")],
  PERSONE,
  "2026-08-22",
  "2026-08-21",
);
uguale("il reparto scritto sul turno vince su quello della persona", "sala", copre[0].departmentId);

const eredita = segmentiDelGiorno(
  [turno("t3", "p1", "2026-08-22", "09:00:00", "13:00:00")],
  PERSONE,
  "2026-08-22",
  "2026-08-21",
);
uguale("senza reparto sul turno vale quello della persona", "cucina", eredita[0].departmentId);

/* ------------------------------------------------------------ fasce ----- */

const fasciaNotturna = [{
  id: "f1", department_id: "cucina", name: "Chiusura",
  start_time: "18:00:00", end_time: "02:00:00", required: 2, weekdays: [6],
}];

uguale(
  "fascia del sabato che scavalca: sabato 18:00-24:00",
  [{ da: 1080, a: 1440 }],
  fasceDelGiorno(fasciaNotturna, "2026-08-22").map(({ da, a }) => ({ da, a })),
);
uguale(
  "fascia del sabato che scavalca: domenica 00:00-02:00",
  [{ da: 0, a: 120 }],
  fasceDelGiorno(fasciaNotturna, "2026-08-23").map(({ da, a }) => ({ da, a })),
);
uguale(
  "fascia del sabato: il venerdi non vale",
  0,
  fasceDelGiorno(fasciaNotturna, "2026-08-21").length,
);

/* -------------------------------------------------------- copertura ----- */

const giornata = segmentiDelGiorno(
  [
    turno("a", "p1", "2026-08-19", "09:00:00", "13:00:00"),
    turno("b", "p2", "2026-08-19", "11:00:00", "15:00:00"),
    // Turno scoperto: non e' una presenza, e' il buco stesso.
    turno("c", null, "2026-08-19", "09:00:00", "15:00:00"),
  ],
  PERSONE,
  "2026-08-19",
  "2026-08-18",
);

const fasce = fasceDelGiorno(
  [{
    id: "f2", department_id: "cucina", name: "Servizio",
    start_time: "09:00:00", end_time: "15:00:00", required: 2,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  }],
  "2026-08-19",
);

const fette = copertura(giornata, fasce, 9 * 60, 15 * 60, 60);
uguale(
  "presenze ora per ora (il turno scoperto non conta)",
  [1, 1, 2, 2, 1, 1],
  fette.map((f) => f.presenti),
);

uguale(
  "buchi uniti: 09-11 e 13-15",
  ["09:00-11:00 1/2", "13:00-15:00 1/2"],
  calcolaBuchi(fette).map((b) => `${oraDa(b.da)}-${oraDa(b.a)} ${b.presenti}/${b.richiesti}`),
);

/* --- buchi con presenze diverse non si uniscono: il numero deve essere esatto --- */

const scalare = segmentiDelGiorno(
  [
    turno("s1", "p1", "2026-08-19", "18:00:00", "23:00:00"),
    turno("s2", "p2", "2026-08-19", "18:00:00", "22:30:00"),
  ],
  PERSONE,
  "2026-08-19",
  "2026-08-18",
);
const fasciaSera = fasceDelGiorno(
  [{
    id: "f3", department_id: "cucina", name: "Cena",
    start_time: "18:00:00", end_time: "23:30:00", required: 3,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  }],
  "2026-08-19",
);
uguale(
  "buchi con presenze diverse restano separati",
  ["18:00-22:30 2/3", "22:30-23:00 1/3", "23:00-23:30 0/3"],
  calcolaBuchi(copertura(scalare, fasciaSera, 18 * 60, 23.5 * 60, 30)).map(
    (b) => `${oraDa(b.da)}-${oraDa(b.a)} ${b.presenti}/${b.richiesti}`,
  ),
);

/* ------- la stessa persona due volte nello stesso momento conta una ------ */

const doppio = segmentiDelGiorno(
  [
    turno("d1", "p1", "2026-08-19", "09:00:00", "13:00:00"),
    turno("d2", "p1", "2026-08-19", "10:00:00", "12:00:00"),
  ],
  PERSONE,
  "2026-08-19",
  "2026-08-18",
);
uguale(
  "due turni sovrapposti della stessa persona contano uno",
  [1, 1, 1, 1],
  copertura(doppio, fasce, 9 * 60, 13 * 60, 60).map((f) => f.presenti),
);

/* ----------------------------------------------------------- assenze ---- */

const MALATTIA_APERTA = [{
  id: "m1", profile_id: "p1", type: "malattia",
  start_date: "2026-08-19", end_date: null,
}];

uguale("assenza aperta: vale il giorno stesso", true,
  Boolean(assenzaDelGiorno(MALATTIA_APERTA, "p1", "2026-08-19")));
uguale("assenza aperta: vale anche fra un mese", true,
  Boolean(assenzaDelGiorno(MALATTIA_APERTA, "p1", "2026-09-30")));
uguale("assenza aperta: non vale il giorno prima", false,
  Boolean(assenzaDelGiorno(MALATTIA_APERTA, "p1", "2026-08-18")));
uguale("assenza: non tocca gli altri", false,
  Boolean(assenzaDelGiorno(MALATTIA_APERTA, "p2", "2026-08-19")));

const MALATTIA_CHIUSA = [{
  id: "m2", profile_id: "p1", type: "malattia",
  start_date: "2026-08-19", end_date: "2026-08-20",
}];
uguale("assenza chiusa: l'ultimo giorno e' compreso", true,
  Boolean(assenzaDelGiorno(MALATTIA_CHIUSA, "p1", "2026-08-20")));
uguale("assenza chiusa: il giorno dopo e' rientrato", false,
  Boolean(assenzaDelGiorno(MALATTIA_CHIUSA, "p1", "2026-08-21")));

// Il turno resta visibile, ma non conta piu' come presenza: e' cosi' che il
// buco compare al responsabile invece di sparire insieme al turno.
const conMalattia = segmentiDelGiorno(
  [
    turno("x1", "p1", "2026-08-19", "09:00:00", "15:00:00"),
    turno("x2", "p2", "2026-08-19", "09:00:00", "15:00:00"),
  ],
  PERSONE,
  "2026-08-19",
  "2026-08-18",
  MALATTIA_APERTA,
);

uguale("il turno di chi e' malato resta visibile", 2, conMalattia.length);
uguale("ed e' marcato come assenza", ["malattia", null],
  conMalattia.map((s) => s.assenza?.tipo ?? null));
uguale(
  "ma non conta come presenza: da 2 si scende a 1",
  [1, 1, 1, 1, 1, 1],
  copertura(conMalattia, fasce, 9 * 60, 15 * 60, 60).map((f) => f.presenti),
);
uguale(
  "e il buco compare",
  ["09:00-15:00 1/2"],
  calcolaBuchi(copertura(conMalattia, fasce, 9 * 60, 15 * 60, 60)).map(
    (b) => `${oraDa(b.da)}-${oraDa(b.a)} ${b.presenti}/${b.richiesti}`,
  ),
);

// Un turno di notte iniziato ieri va giudicato con l'assenza di ieri.
const notteMalato = segmentiDelGiorno(
  [turno("x3", "p1", "2026-08-19", "18:00:00", "02:00:00")],
  PERSONE,
  "2026-08-20",
  "2026-08-19",
  MALATTIA_CHIUSA,
);
uguale("turno notturno: conta l'assenza del giorno in cui e' iniziato",
  "malattia", notteMalato[0].assenza?.tipo ?? null);

/* --------------------------------------------------------- intervallo --- */

uguale(
  "intervallo: arrotondato all'ora attorno ai turni",
  { da: 9 * 60, a: 15 * 60 },
  intervalloVisibile(giornata, fasce),
);
uguale(
  "intervallo: una giornata vuota resta leggibile",
  { da: 8 * 60, a: 20 * 60 },
  intervalloVisibile([], []),
);

const corto = segmentiDelGiorno(
  [turno("e", "p1", "2026-08-19", "10:00:00", "12:00:00")],
  PERSONE,
  "2026-08-19",
  "2026-08-18",
);
const finestra = intervalloVisibile(corto, []);
uguale("intervallo: un turno solo viene allargato a 6 ore", 360, finestra.a - finestra.da);

uguale("mezzanotte di fine si scrive 24:00", "24:00", oraDa(1440));

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

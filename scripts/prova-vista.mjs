/** Controlli sulle tre viste della Supervisione: giorno, mese, anno.
 *    node --import ./scripts/alias.mjs scripts/prova-vista.mjs */
import { giorniTra, vistaGiorno, vistaPeriodo } from "../src/lib/supervisione/vista.ts";

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
  { id: "p1", full_name: "Anna", department_id: "cucina", contract_hours: 40, on_call: false },
  { id: "p2", full_name: "Bruno", department_id: "cucina", contract_hours: 20, on_call: false },
  { id: "p3", full_name: "Carla", department_id: "sala", contract_hours: null, on_call: true },
];
const REPARTI = [
  { id: "cucina", name: "Cucina", hue: 25 },
  { id: "sala", name: "Sala", hue: 190 },
];
const FASCE = [
  {
    id: "f1", department_id: "cucina", name: "Pranzo",
    start_time: "11:00", end_time: "15:00", required: 2,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  },
];

const t = (id, profile_id, date, start_time, end_time) => ({
  id, profile_id, date, start_time, end_time, title: null, department_id: null,
});

const ore = (m) => Math.round((m / 60) * 100) / 100;

/* ------------------------------------------------------------- un giorno */

const giorno = vistaGiorno({
  giorno: "2026-08-19",
  persone: PERSONE,
  reparti: REPARTI,
  fasce: FASCE,
  assenze: [],
  turni: [
    t("a", "p1", "2026-08-19", "11:00", "15:00"),
    t("b", null, "2026-08-19", "18:00", "22:00"),
  ],
});

uguale("giorno: una scheda per persona, non per reparto", 3, giorno.persone.length);
uguale("giorno: prima chi lavora, poi chi riposa",
  ["Anna", "Bruno", "Carla"],
  giorno.persone.map((p) => p.nome));
uguale("giorno: il reparto resta come etichetta", ["Cucina", "Cucina", "Sala"],
  giorno.persone.map((p) => p.reparto));
uguale("giorno: i buchi portano il nome del reparto",
  ["Cucina 11:00 1/2"],
  giorno.buchi.map((b) => `${b.reparto} ${String(Math.floor(b.da / 60)).padStart(2, "0")}:00 ${b.presenti}/${b.richiesti}`));
uguale("giorno: i turni di nessuno restano a parte", 1, giorno.daAssegnare.length);
uguale("giorno: ore della persona", 4, ore(giorno.persone[0].minuti));

/* ------------------------------------------- un giorno, con una malattia */

const malato = vistaGiorno({
  giorno: "2026-08-19",
  persone: PERSONE,
  reparti: REPARTI,
  fasce: FASCE,
  assenze: [{ id: "m", profile_id: "p1", type: "malattia", start_date: "2026-08-19", end_date: null }],
  turni: [t("a", "p1", "2026-08-19", "11:00", "15:00")],
});
const anna = malato.persone.find((p) => p.nome === "Anna");
uguale("assente: la scheda dice il perché", "Malattia", anna.assenza);
uguale("assente: le sue ore non contano", 0, anna.minuti);
uguale("assente: il turno resta visibile", 1, anna.segmenti.length);
uguale("assente: e il buco peggiora a nessuno presente",
  [0], malato.buchi.map((b) => b.presenti));

/* ------------------------------------------------------------- un mese -- */

uguale("agosto ha 31 giorni", 31, giorniTra("2026-08-01", "2026-08-31").length);

const mese = vistaPeriodo({
  tipo: "mese",
  da: "2026-08-01",
  a: "2026-08-31",
  persone: PERSONE,
  reparti: REPARTI,
  fasce: [],
  assenze: [{ id: "m", profile_id: "p2", type: "ferie", start_date: "2026-08-10", end_date: "2026-08-12" }],
  turni: [
    t("a", "p1", "2026-08-03", "09:00", "17:00"), // 8h
    t("b", "p1", "2026-08-04", "09:00", "13:00"), // 4h
    t("c", "p2", "2026-08-11", "09:00", "17:00"), // in ferie: non conta
  ],
});

uguale("mese: una colonna per giorno", 31, mese.colonne.length);
uguale("mese: le ore finiscono nella colonna giusta",
  { "2026-08-03": 8, "2026-08-04": 4 },
  Object.fromEntries(
    mese.persone
      .find((p) => p.nome === "Anna")
      .valori.map((v, i) => [mese.colonne[i].chiave, ore(v)])
      .filter(([, v]) => v > 0),
  ));

const bruno = mese.persone.find((p) => p.nome === "Bruno");
uguale("mese: le ore in ferie non entrano nelle colonne", 0, ore(bruno.minuti));
uguale("mese: ma restano contate come perse", 8, ore(bruno.minutiPersi));
uguale("mese: e il turno saltato si conta", 1, bruno.turniSaltati);
uguale("mese: i giorni di ferie sono tre", [{ causale: "ferie", giorni: 3 }], bruno.assenze);
uguale("mese: chi è a chiamata non ha ore attese", null,
  mese.persone.find((p) => p.nome === "Carla").attesi);
uguale("mese: le attese si riproporzionano sul periodo", 177.14,
  ore(mese.persone.find((p) => p.nome === "Anna").attesi));

/* ------------------------------------------------------------- un anno -- */

const anno = vistaPeriodo({
  tipo: "anno",
  da: "2026-01-01",
  a: "2026-12-31",
  persone: PERSONE,
  reparti: REPARTI,
  fasce: [],
  assenze: [],
  turni: [
    t("a", "p1", "2026-03-02", "09:00", "17:00"), // 8h a marzo
    t("b", "p1", "2026-03-09", "09:00", "17:00"), // altre 8h a marzo
    t("c", "p1", "2026-11-02", "09:00", "13:00"), // 4h a novembre
  ],
});

uguale("anno: dodici colonne", 12, anno.colonne.length);
uguale("anno: le ore si raggruppano per mese",
  { "2026-03": 16, "2026-11": 4 },
  Object.fromEntries(
    anno.persone
      .find((p) => p.nome === "Anna")
      .valori.map((v, i) => [anno.colonne[i].chiave, ore(v)])
      .filter(([, v]) => v > 0),
  ));
uguale("anno: le etichette sono i mesi", ["gen", "feb", "mar"],
  anno.colonne.slice(0, 3).map((c) => c.corta));

/* -------------------------------- le mancanze si sommano lungo il periodo */

const conBuchi = vistaPeriodo({
  tipo: "mese",
  da: "2026-08-01",
  a: "2026-08-03",
  persone: PERSONE,
  reparti: REPARTI,
  fasce: FASCE,
  assenze: [],
  turni: [t("a", "p1", "2026-08-01", "11:00", "15:00")], // uno solo su due richiesti
});
uguale("periodo: conta solo i giorni in cui il tabellone e' fatto", 1,
  conBuchi.giorniConBuchi);
uguale("periodo: gli altri sono giorni senza turni, non mancanze", 2,
  conBuchi.giorniSenzaTurni);
uguale("periodo: le mancanze finiscono solo sulle colonne pianificate", 1,
  conBuchi.scopertiPerColonna.filter((v) => v > 0).length);

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

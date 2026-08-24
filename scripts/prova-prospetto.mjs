/** Controlli sul prospetto del responsabile: settimana, mese, anno.
 *    node --import ./scripts/alias.mjs scripts/prova-prospetto.mjs */
import { calcolaProspetto, giorniTra } from "../src/lib/prospetto.ts";

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

const base = {
  persone: PERSONE, reparti: REPARTI, fasce: [], assenze: [], turni: [],
};

/* ------------------------------------------------------------- periodi -- */

uguale("il periodo conta i giorni compresi", 7,
  giorniTra("2026-08-17", "2026-08-23").length);
uguale("un giorno solo e' un giorno", ["2026-08-17"],
  giorniTra("2026-08-17", "2026-08-17"));

const settimana = calcolaProspetto({
  ...base, livello: "settimana", da: "2026-08-17", a: "2026-08-23",
  turni: [
    t("a", "p1", "2026-08-17", "09:00", "17:00"), // 8h
    t("b", "p1", "2026-08-18", "09:00", "17:00"), // 8h
    t("c", "p2", "2026-08-19", "18:00", "23:00"), // 5h
    t("d", null, "2026-08-21", "18:00", "22:00"), // scoperto
  ],
});

uguale("settimana: sette colonne, una per giorno", 7, settimana.colonne.length);
uguale("settimana: le colonne portano il nome del giorno",
  ["lun", "mar", "mer"], settimana.colonne.slice(0, 3).map((c) => c.corta));
uguale("settimana: una riga per persona, senza reparti di mezzo",
  ["Anna", "Bruno", "Carla"],
  [...settimana.righe].sort((x, y) => x.nome.localeCompare(y.nome)).map((r) => r.nome));
uguale("settimana: il reparto resta come etichetta",
  { Anna: "Cucina", Bruno: "Cucina", Carla: "Sala" },
  Object.fromEntries(settimana.righe.map((r) => [r.nome, r.reparto])));
uguale("settimana: le ore finiscono nella colonna giusta",
  { "2026-08-17": 8, "2026-08-18": 8 },
  Object.fromEntries(
    settimana.righe.find((r) => r.nome === "Anna")
      .valori.map((v, i) => [settimana.colonne[i].chiave, ore(v)])
      .filter(([, v]) => v > 0),
  ));
uguale("settimana: le ore attese valgono esattamente il contratto",
  { Anna: 40, Bruno: 20, Carla: null },
  Object.fromEntries(
    settimana.righe.map((r) => [r.nome, r.attesi === null ? null : ore(r.attesi)]),
  ));
uguale("settimana: totale delle ore lavorate", 21, ore(settimana.totali.minuti));
uguale("settimana: i turni di nessuno restano a parte",
  { turni: 1, ore: 4 },
  { turni: settimana.turniDaAssegnare, ore: ore(settimana.minutiDaAssegnare) });

/* --------------------------------------------------------- con assenze -- */

const conAssenza = calcolaProspetto({
  ...base, livello: "settimana", da: "2026-08-17", a: "2026-08-23",
  assenze: [{ id: "m", profile_id: "p1", type: "malattia", start_date: "2026-08-18", end_date: null }],
  turni: [
    t("a", "p1", "2026-08-17", "09:00", "17:00"), // prima: conta
    t("b", "p1", "2026-08-18", "09:00", "17:00"), // durante: non conta
    t("c", "p1", "2026-08-19", "09:00", "17:00"), // durante: non conta
  ],
});
const anna = conAssenza.righe.find((r) => r.nome === "Anna");

uguale("assenza: le ore lavorate sono solo quelle prima", 8, ore(anna.minuti));
uguale("assenza: le altre restano contate come perse", 16, ore(anna.minutiPersi));
uguale("assenza: e i turni saltati si contano", 2, anna.turniSaltati);
uguale("assenza: nelle colonne entra solo il giorno lavorato",
  ["2026-08-17"],
  anna.valori.map((v, i) => (v > 0 ? conAssenza.colonne[i].chiave : null)).filter(Boolean));
uguale("assenza: giorni di calendario, dall'inizio a fine periodo", 6, anna.giorniAssenza);
uguale("assenza: ripartita per causale", [{ causale: "malattia", giorni: 6 }], anna.assenze);
uguale("assenza: il totale del periodo la scomputa", 8, ore(conAssenza.totali.minuti));

const MISTE = [
  { id: "b1", profile_id: "p2", type: "legge_104", start_date: "2026-08-17", end_date: "2026-08-18" },
  { id: "b2", profile_id: "p2", type: "ferie", start_date: "2026-08-20", end_date: "2026-08-21" },
];
uguale("due causali nello stesso periodo restano distinte",
  [{ causale: "legge_104", giorni: 2 }, { causale: "ferie", giorni: 2 }],
  calcolaProspetto({ ...base, livello: "settimana", da: "2026-08-17", a: "2026-08-23", assenze: MISTE })
    .righe.find((r) => r.nome === "Bruno").assenze);

/* ---------------------------------------------------------- mese e anno - */

const mese = calcolaProspetto({
  ...base, livello: "mese", da: "2026-09-01", a: "2026-09-30",
});
uguale("mese: una colonna per giorno", 30, mese.colonne.length);
uguale("mese: le attese si riproporzionano", 171.43,
  ore(mese.righe.find((r) => r.nome === "Anna").attesi));

const anno = calcolaProspetto({
  ...base, livello: "anno", da: "2026-01-01", a: "2026-12-31",
  turni: [
    t("a", "p1", "2026-03-02", "09:00", "17:00"), // 8h a marzo
    t("b", "p1", "2026-03-09", "09:00", "17:00"), // altre 8h a marzo
    t("c", "p1", "2026-11-02", "09:00", "13:00"), // 4h a novembre
  ],
});
uguale("anno: dodici colonne", 12, anno.colonne.length);
uguale("anno: le etichette sono i mesi", ["gen", "feb", "mar"],
  anno.colonne.slice(0, 3).map((c) => c.corta));
uguale("anno: le ore si raggruppano per mese",
  { "2026-03": 16, "2026-11": 4 },
  Object.fromEntries(
    anno.righe.find((r) => r.nome === "Anna")
      .valori.map((v, i) => [anno.colonne[i].chiave, ore(v)])
      .filter(([, v]) => v > 0),
  ));

/* ------------------------------------------------------------ mancanze -- */

const conBuchi = calcolaProspetto({
  ...base, livello: "mese", da: "2026-08-01", a: "2026-08-03",
  fasce: FASCE,
  turni: [t("a", "p1", "2026-08-01", "11:00", "15:00")], // uno su due richiesti
});

uguale("mancanze: solo nei giorni in cui il tabellone e' fatto", 1,
  conBuchi.giorniConMancanze);
uguale("mancanze: gli altri sono giorni senza turni, non buchi", 2,
  conBuchi.giorniSenzaTurni);
uguale("mancanze: 4 ore scoperte, con reparto e presenze",
  ["Cucina 4h 1/2"],
  conBuchi.mancanze.map((m) => `${m.reparto} ${(m.a - m.da) / 60}h ${m.presenti}/${m.richiesti}`));
uguale("mancanze: distribuite su una colonna sola", 1,
  conBuchi.scopertiPerColonna.filter((v) => v > 0).length);

// Con la persona in malattia il buco peggiora: e' il punto della funzione.
const buchiConMalattia = calcolaProspetto({
  ...base, livello: "mese", da: "2026-08-01", a: "2026-08-01",
  fasce: FASCE,
  assenze: [{ id: "m", profile_id: "p1", type: "malattia", start_date: "2026-08-01", end_date: null }],
  turni: [t("a", "p1", "2026-08-01", "11:00", "15:00")],
});
uguale("mancanze: chi e' assente non conta come presenza",
  [0], buchiConMalattia.mancanze.map((m) => m.presenti));

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

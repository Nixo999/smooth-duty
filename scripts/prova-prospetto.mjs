/** Controlli sul prospetto del responsabile.
 *    node --import ./scripts/alias.mjs scripts/prova-prospetto.mjs */
import { calcolaProspetto, giorniDelPeriodo } from "../src/lib/prospetto.ts";

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
  { id: "p1", full_name: "Giulia", department_id: "cucina", contract_hours: 40, on_call: false },
  { id: "p2", full_name: "Davide", department_id: "cucina", contract_hours: 24, on_call: false },
  { id: "p3", full_name: "Youssef", department_id: "sala", contract_hours: null, on_call: true },
];
const REPARTI = [
  { id: "cucina", name: "Cucina", hue: 25 },
  { id: "sala", name: "Sala", hue: 190 },
];

const t = (profile_id, date, start_time, end_time) => ({
  profile_id, date, start_time, end_time,
});

uguale("il periodo conta i giorni compresi", 7,
  giorniDelPeriodo("2026-08-17", "2026-08-23").length);
uguale("un giorno solo e' un giorno", ["2026-08-17"],
  giorniDelPeriodo("2026-08-17", "2026-08-17"));

/* ------------------------------------------------ settimana senza assenze */

const base = calcolaProspetto({
  da: "2026-08-17", a: "2026-08-23",
  persone: PERSONE, reparti: REPARTI, assenze: [],
  turni: [
    t("p1", "2026-08-17", "09:00", "17:00"), // 8h
    t("p1", "2026-08-18", "09:00", "17:00"), // 8h
    t("p2", "2026-08-19", "18:00", "23:00"), // 5h
    t("p3", "2026-08-20", "19:00", "23:00"), // 4h
    t(null, "2026-08-21", "18:00", "22:00"), // scoperto, 4h
  ],
});

const ore = (m) => Math.round((m / 60) * 100) / 100;

uguale("ore effettive per reparto", { Cucina: 21, Sala: 4 },
  Object.fromEntries(base.gruppi.map((g) => [g.nome, ore(g.totali.effettivi)])));
uguale("totale azienda", 25, ore(base.totale.effettivi));
uguale("i turni scoperti restano fuori dalle persone", 4, ore(base.scopertiMinuti));
// Le righe escono in ordine alfabetico dentro il reparto: e' cosi' che le
// cerca l'occhio in un elenco di trenta persone.
uguale("ore attese: su una settimana valgono esattamente il contratto",
  { Davide: 24, Giulia: 40, Youssef: null },
  Object.fromEntries(
    base.gruppi.flatMap((g) =>
      g.righe.map((r) => [r.nome, r.totali.attesi === null ? null : ore(r.totali.attesi)]),
    ),
  ));
uguale("chi e' a chiamata non ha ore attese, e non le somma al reparto",
  64, ore(base.gruppi.find((g) => g.nome === "Cucina").totali.attesi));

/* ------------------------------------------------------- con una malattia */

const MALATTIA = [{
  id: "a1", profile_id: "p1", type: "malattia",
  start_date: "2026-08-18", end_date: null,
}];

const conAssenza = calcolaProspetto({
  da: "2026-08-17", a: "2026-08-23",
  persone: PERSONE, reparti: REPARTI, assenze: MALATTIA,
  turni: [
    t("p1", "2026-08-17", "09:00", "17:00"), // prima: conta
    t("p1", "2026-08-18", "09:00", "17:00"), // durante: non conta
    t("p1", "2026-08-19", "09:00", "17:00"), // durante: non conta
  ],
});

const giulia = conAssenza.gruppi
  .find((g) => g.nome === "Cucina")
  .righe.find((r) => r.nome === "Giulia");

uguale("programmate restano tutte", 24, ore(giulia.totali.programmati));
uguale("le ore perse per assenza sono separate", 16, ore(giulia.totali.persi));
uguale("le effettive sono quelle che restano", 8, ore(giulia.totali.effettivi));
uguale("programmate = perse + effettive", true,
  giulia.totali.programmati === giulia.totali.persi + giulia.totali.effettivi);
uguale("turni saltati da coprire", 2, giulia.turniSaltati);
uguale("giorni di calendario in assenza (aperta, fino a domenica)", 6, giulia.giorniAssenza);
uguale("ripartiti per causale", [{ causale: "malattia", giorni: 6 }],
  giulia.assenzePerCausale);

/* ----------------------------------------------- causali diverse insieme */

const MISTE = [
  { id: "b1", profile_id: "p2", type: "legge_104", start_date: "2026-08-17", end_date: "2026-08-18" },
  { id: "b2", profile_id: "p2", type: "ferie", start_date: "2026-08-20", end_date: "2026-08-21" },
];
const miste = calcolaProspetto({
  da: "2026-08-17", a: "2026-08-23",
  persone: PERSONE, reparti: REPARTI, assenze: MISTE, turni: [],
});
const davide = miste.gruppi.find((g) => g.nome === "Cucina").righe.find((r) => r.nome === "Davide");
uguale("due causali nello stesso periodo restano distinte",
  [{ causale: "legge_104", giorni: 2 }, { causale: "ferie", giorni: 2 }],
  davide.assenzePerCausale);

/* ------------------------------------------------------------- un mese --- */

const mese = calcolaProspetto({
  da: "2026-09-01", a: "2026-09-30",
  persone: PERSONE, reparti: REPARTI, assenze: [], turni: [],
});
uguale("su un mese le ore attese si riproporzionano", 171.43,
  ore(mese.gruppi.find((g) => g.nome === "Cucina").righe.find((r) => r.nome === "Giulia").totali.attesi));

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

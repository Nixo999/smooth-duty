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
const ore = (m) => Math.round((m / 60) * 100) / 100;

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

uguale("una tabella sola, non piu' divisa per reparto",
  ["Davide", "Giulia", "Youssef"], base.righe.map((r) => r.nome));
uguale("il reparto resta come etichetta accanto al nome",
  { Davide: "Cucina", Giulia: "Cucina", Youssef: "Sala" },
  Object.fromEntries(base.righe.map((r) => [r.nome, r.reparto])));
uguale("totale azienda", 25, ore(base.totale.effettivi));
uguale("i turni scoperti restano fuori dalle persone", 4, ore(base.scopertiMinuti));
uguale("ore attese: su una settimana valgono esattamente il contratto",
  { Davide: 24, Giulia: 40, Youssef: null },
  Object.fromEntries(
    base.righe.map((r) => [r.nome, r.totali.attesi === null ? null : ore(r.totali.attesi)]),
  ));
uguale("senza assenze c'e' comunque la colonna malattia", ["malattia"], base.causali);
uguale("e il totale assenze e' zero", 0, base.totaleAssenze);

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

const giulia = conAssenza.righe.find((r) => r.nome === "Giulia");

uguale("programmate restano tutte", 24, ore(giulia.totali.programmati));
uguale("le ore perse per assenza sono separate", 16, ore(giulia.totali.persi));
uguale("le effettive sono quelle che restano", 8, ore(giulia.totali.effettivi));
uguale("programmate = perse + effettive", true,
  giulia.totali.programmati === giulia.totali.persi + giulia.totali.effettivi);
uguale("turni saltati da coprire", 2, giulia.turniSaltati);
uguale("le ore di assenza finiscono sotto la loro causale",
  { malattia: 16 },
  Object.fromEntries(Object.entries(giulia.perCausale).map(([c, m]) => [c, ore(m)])));
uguale("giorni di calendario in assenza (aperta, fino a domenica)", 6, giulia.giorniAssenza);
uguale("il totale della colonna", 16, ore(conAssenza.totalePerCausale.malattia));

/* ----------------------------------------------- causali diverse insieme */

const MISTE = [
  { id: "b1", profile_id: "p2", type: "legge_104", start_date: "2026-08-17", end_date: "2026-08-18" },
  { id: "b2", profile_id: "p2", type: "ferie", start_date: "2026-08-20", end_date: "2026-08-21" },
];
const miste = calcolaProspetto({
  da: "2026-08-17", a: "2026-08-23",
  persone: PERSONE, reparti: REPARTI, assenze: MISTE,
  turni: [
    t("p2", "2026-08-17", "09:00", "13:00"), // 4h di 104
    t("p2", "2026-08-20", "18:00", "23:00"), // 5h di ferie
    t("p2", "2026-08-22", "18:00", "23:00"), // lavorate
  ],
});
const davide = miste.righe.find((r) => r.nome === "Davide");

uguale("due causali, due colonne separate",
  { legge_104: 4, ferie: 5 },
  Object.fromEntries(Object.entries(davide.perCausale).map(([c, m]) => [c, ore(m)])));
uguale("malattia resta la prima colonna anche se nessuno si e' ammalato",
  "malattia", miste.causali[0]);
uguale("le altre colonne ci sono tutte",
  ["malattia", "ferie", "legge_104"], miste.causali);
uguale("il totale delle assenze somma le causali", 9, ore(miste.totaleAssenze));
uguale("le ore lavorate escludono i giorni di assenza", 5, ore(davide.totali.effettivi));

/* --------------------- un permesso in un giorno di riposo non costa ore -- */

const inRiposo = calcolaProspetto({
  da: "2026-08-17", a: "2026-08-23",
  persone: PERSONE, reparti: REPARTI,
  assenze: [{ id: "c1", profile_id: "p1", type: "lutto", start_date: "2026-08-19", end_date: "2026-08-19" }],
  turni: [t("p1", "2026-08-17", "09:00", "17:00")], // il 19 non lavorava
});
const senzaOre = inRiposo.righe.find((r) => r.nome === "Giulia");
uguale("zero ore perse, perche' quel giorno non lavorava", 0,
  ore(Object.values(senzaOre.perCausale).reduce((n, m) => n + m, 0)));
uguale("ma il giorno resta contato", { lutto: 1 }, senzaOre.giorniPerCausale);
uguale("e la colonna compare lo stesso", ["malattia", "lutto"], inRiposo.causali);

/* ------------------------------------------------------------- un mese --- */

const mese = calcolaProspetto({
  da: "2026-09-01", a: "2026-09-30",
  persone: PERSONE, reparti: REPARTI, assenze: [], turni: [],
});
uguale("su un mese le ore attese si riproporzionano", 171.43,
  ore(mese.righe.find((r) => r.nome === "Giulia").totali.attesi));

/* ------------------------------------------------------------- un anno --- */

const anno = calcolaProspetto({
  da: "2026-01-01", a: "2026-12-31",
  persone: PERSONE, reparti: REPARTI, assenze: [], turni: [],
});
uguale("l'anno conta 365 giorni", 365, anno.giorni);
uguale("e le attese si riproporzionano su tutto l'anno", 2085.71,
  ore(anno.righe.find((r) => r.nome === "Giulia").totali.attesi));

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

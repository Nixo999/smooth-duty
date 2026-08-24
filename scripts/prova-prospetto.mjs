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
const oreCausali = (r) =>
  Object.fromEntries(Object.entries(r.perCausale).map(([c, m]) => [c, ore(m)]));

/** La settimana di riferimento: 17 agosto 2026 e' un lunedi'. */
const SETT = { da: "2026-08-17", a: "2026-08-23" };

uguale("il periodo conta i giorni compresi", 7,
  giorniDelPeriodo("2026-08-17", "2026-08-23").length);
uguale("un giorno solo e' un giorno", ["2026-08-17"],
  giorniDelPeriodo("2026-08-17", "2026-08-17"));

/* ------------------------------------------------ settimana senza assenze */

const base = calcolaProspetto({
  ...SETT,
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
uguale("chi lavora sotto contratto senza essere assente non perde ore", 0,
  ore(base.totale.persi));

/* ------------------------- l'esempio del committente, parola per parola --
 *
 *  40 ore da contratto, cinque giorni di malattia, negli altri due solo
 *  dieci ore lavorate: l'assenza vale 30 ore. E se non lavora proprio, 40. */

const cinqueGiorni = [{
  id: "m1", profile_id: "p1", type: "malattia",
  start_date: "2026-08-19", end_date: "2026-08-23",
}];

const esempio = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI, assenze: cinqueGiorni,
  turni: [
    t("p1", "2026-08-17", "09:00", "14:00"), // 5h
    t("p1", "2026-08-18", "09:00", "14:00"), // 5h
  ],
});
const esempioGiulia = esempio.righe.find((r) => r.nome === "Giulia");

uguale("40 da contratto, 10 lavorate, 5 giorni di malattia: 30 ore di assenza",
  { malattia: 30 }, oreCausali(esempioGiulia));
uguale("i giorni di malattia restano cinque", { malattia: 5 },
  esempioGiulia.giorniPerCausale);

const settimanaIntera = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI, turni: [],
  assenze: [{
    id: "m2", profile_id: "p1", type: "malattia",
    start_date: "2026-08-17", end_date: "2026-08-23",
  }],
});
uguale("una settimana intera a casa: 40 ore, senza nemmeno un turno scritto",
  { malattia: 40 },
  oreCausali(settimanaIntera.righe.find((r) => r.nome === "Giulia")));

const sopraContratto = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI,
  assenze: [{
    id: "m3", profile_id: "p2", type: "malattia",
    start_date: "2026-08-23", end_date: "2026-08-23",
  }],
  turni: [
    t("p2", "2026-08-17", "09:00", "21:00"), // 12h
    t("p2", "2026-08-18", "09:00", "21:00"), // 12h
  ],
});
uguale("chi ha comunque fatto le sue ore non ha perso niente", {},
  oreCausali(sopraContratto.righe.find((r) => r.nome === "Davide")));
uguale("ma il giorno di assenza resta contato", { malattia: 1 },
  sopraContratto.righe.find((r) => r.nome === "Davide").giorniPerCausale);

/* ------------------------------------------------------- con una malattia */

const MALATTIA = [{
  id: "a1", profile_id: "p1", type: "malattia",
  start_date: "2026-08-18", end_date: null,
}];

const conAssenza = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI, assenze: MALATTIA,
  turni: [
    t("p1", "2026-08-17", "09:00", "17:00"), // prima: conta
    t("p1", "2026-08-18", "09:00", "17:00"), // durante: non conta
    t("p1", "2026-08-19", "09:00", "17:00"), // durante: non conta
  ],
});

const giulia = conAssenza.righe.find((r) => r.nome === "Giulia");

uguale("programmate restano tutte", 24, ore(giulia.totali.programmati));
uguale("le effettive sono quelle che restano", 8, ore(giulia.totali.effettivi));
uguale("le ore di turno saltate sono quelle da ricoprire", 16,
  ore(giulia.totali.saltati));
uguale("le ore perse sono 40 meno le 8 lavorate, non le 16 a tabellone", 32,
  ore(giulia.totali.persi));
uguale("turni saltati da coprire", 2, giulia.turniSaltati);
uguale("le ore di assenza finiscono sotto la loro causale",
  { malattia: 32 }, oreCausali(giulia));
uguale("giorni di calendario in assenza (aperta, fino a domenica)", 6, giulia.giorniAssenza);
uguale("il totale della colonna", 32, ore(conAssenza.totalePerCausale.malattia));

/* ----------------------------------------------- causali diverse insieme */

const MISTE = [
  { id: "b1", profile_id: "p2", type: "legge_104", start_date: "2026-08-17", end_date: "2026-08-18" },
  { id: "b2", profile_id: "p2", type: "ferie", start_date: "2026-08-20", end_date: "2026-08-21" },
];
const miste = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI, assenze: MISTE,
  turni: [
    t("p2", "2026-08-17", "09:00", "13:00"), // durante il 104
    t("p2", "2026-08-20", "18:00", "23:00"), // durante le ferie
    t("p2", "2026-08-22", "18:00", "23:00"), // lavorate, 5h
  ],
});
const davide = miste.righe.find((r) => r.nome === "Davide");

// 24 da contratto meno 5 lavorate = 19 ore mancate, divise fra due causali
// da due giorni ciascuna.
uguale("due causali si dividono le ore mancate in proporzione ai giorni",
  { legge_104: 9.5, ferie: 9.5 }, oreCausali(davide));
uguale("malattia resta la prima colonna anche se nessuno si e' ammalato",
  "malattia", miste.causali[0]);
uguale("le altre colonne ci sono tutte",
  ["malattia", "ferie", "legge_104"], miste.causali);
uguale("il totale delle assenze somma le causali", 19, ore(miste.totaleAssenze));
uguale("le ore lavorate escludono i giorni di assenza", 5, ore(davide.totali.effettivi));

/* ------------------ un permesso in un giorno di riposo costa lo stesso -- */

const inRiposo = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI,
  assenze: [{ id: "c1", profile_id: "p1", type: "lutto", start_date: "2026-08-19", end_date: "2026-08-19" }],
  turni: [t("p1", "2026-08-17", "09:00", "17:00")], // il 19 non era a tabellone
});
const senzaTurno = inRiposo.righe.find((r) => r.nome === "Giulia");
uguale("il turno non c'era, ma le ore da contratto mancano lo stesso",
  { lutto: 32 }, oreCausali(senzaTurno));
uguale("e il giorno resta uno solo", { lutto: 1 }, senzaTurno.giorniPerCausale);
uguale("la colonna compare", ["malattia", "lutto"], inRiposo.causali);
uguale("nessun turno saltato: non ce n'erano", 0, senzaTurno.turniSaltati);

/* ------------------------------------- a chiamata: il contratto non c'e' */

const aChiamata = calcolaProspetto({
  ...SETT,
  persone: PERSONE, reparti: REPARTI,
  assenze: [{ id: "d1", profile_id: "p3", type: "malattia", start_date: "2026-08-19", end_date: "2026-08-20" }],
  turni: [
    t("p3", "2026-08-19", "19:00", "23:00"), // 4h saltate
    t("p3", "2026-08-21", "19:00", "23:00"), // 4h lavorate
  ],
});
uguale("senza contratto restano le ore dei turni saltati", { malattia: 4 },
  oreCausali(aChiamata.righe.find((r) => r.nome === "Youssef")));

/* --------------------------- settimane diverse, conti diversi e sommati -- */

const dueSettimane = calcolaProspetto({
  da: "2026-08-17", a: "2026-08-30",
  persone: PERSONE, reparti: REPARTI,
  assenze: [
    { id: "e1", profile_id: "p1", type: "ferie", start_date: "2026-08-17", end_date: "2026-08-23" },
    { id: "e2", profile_id: "p1", type: "malattia", start_date: "2026-08-24", end_date: "2026-08-25" },
  ],
  turni: [
    // La seconda settimana lavora comunque 38 ore: ne mancano 2.
    t("p1", "2026-08-26", "09:00", "22:00"), // 13h
    t("p1", "2026-08-27", "09:00", "22:00"), // 13h
    t("p1", "2026-08-28", "09:00", "21:00"), // 12h
  ],
});
uguale("ogni settimana fa il suo conto, poi si sommano",
  { ferie: 40, malattia: 2 },
  oreCausali(dueSettimane.righe.find((r) => r.nome === "Giulia")));

/* --------------- settimana a cavallo del periodo: si conta la parte dentro */

const aCavallo = calcolaProspetto({
  // 1 settembre 2026 e' un martedi': della prima settimana il mese ne
  // prende sei giorni, e il contratto vale per sei settimi.
  da: "2026-09-01", a: "2026-09-06",
  persone: PERSONE, reparti: REPARTI, turni: [],
  assenze: [{ id: "f1", profile_id: "p1", type: "malattia", start_date: "2026-09-01", end_date: "2026-09-06" }],
});
uguale("dei giorni fuori dal periodo non si risponde", 34.28,
  ore(aCavallo.righe.find((r) => r.nome === "Giulia").totali.persi));

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

/** Controlli sulla matematica del trascinamento delle barre (Supervisione).
 *    node --import ./scripts/alias.mjs scripts/prova-trascina.mjs */
import {
  applicaTrascina,
  orariDa,
  PASSO,
} from "../src/lib/supervisione/trascina.ts";

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

/* Un turno 09:00–17:00: inizio 540, durata 480. */

/* ------------------------------------------------------------- sposta --- */

uguale(
  "sposta: un'ora a destra, stesse ore",
  { inizio: 600, durata: 480 },
  applicaTrascina("sposta", 540, 480, 62),
);
uguale(
  "sposta: sotto mezzo passo non si muove",
  { inizio: 540, durata: 480 },
  applicaTrascina("sposta", 540, 480, PASSO / 2 - 1),
);
uguale(
  "sposta: non si esce dal giorno a sinistra",
  { inizio: 0, durata: 480 },
  applicaTrascina("sposta", 540, 480, -600),
);
uguale(
  "sposta: l'inizio si ferma alle 23:45 (la fine scavalca)",
  { inizio: 1425, durata: 480 },
  applicaTrascina("sposta", 540, 480, 1000),
);
uguale(
  "un trascinamento sotto mezzo passo non cambia niente, mai",
  { inizio: 0, durata: 1430 },
  applicaTrascina("fine", 0, 1430, 3),
);

/* ------------------------------------------------------------- inizio --- */

uguale(
  "bordo sinistro tirato a sinistra: il turno si allunga",
  { inizio: 480, durata: 540 },
  applicaTrascina("inizio", 540, 480, -60),
);
uguale(
  "bordo sinistro tirato a destra: il turno si accorcia",
  { inizio: 660, durata: 360 },
  applicaTrascina("inizio", 540, 480, 120),
);
uguale(
  "bordo sinistro: resta almeno un passo di turno",
  { inizio: 1005, durata: PASSO },
  applicaTrascina("inizio", 540, 480, 1000),
);
uguale(
  "bordo sinistro: non si va prima della mezzanotte",
  { inizio: 0, durata: 180 },
  applicaTrascina("inizio", 60, 120, -300),
);

/* --------------------------------------------------------------- fine --- */

uguale(
  "bordo destro tirato a destra: il turno si allunga",
  { inizio: 540, durata: 540 },
  applicaTrascina("fine", 540, 480, 60),
);
uguale(
  "bordo destro: resta almeno un passo di turno",
  { inizio: 540, durata: PASSO },
  applicaTrascina("fine", 540, 480, -1000),
);
uguale(
  "bordo destro: mai un giorno intero, inizio e fine uguali non esistono",
  { inizio: 540, durata: 1440 - PASSO },
  applicaTrascina("fine", 540, 480, 2000),
);
uguale(
  "un turno gia' piu' corto di un passo non si allunga da solo",
  { inizio: 540, durata: 10 },
  applicaTrascina("fine", 540, 10, -300),
);

/* ------------------------------------------------- oltre la mezzanotte --- */

/* Un turno di notte 18:00–02:00: inizio 1080, durata 480. */

uguale(
  "notte spostata di un'ora: 19:00–03:00",
  { start_time: "19:00", end_time: "03:00" },
  orariDa(1140, 480),
);
uguale(
  "bordo sinistro sulla notte: l'inizio si ferma alle 23:45",
  { inizio: 1425, durata: 135 },
  applicaTrascina("inizio", 1080, 480, 600),
);

/* --------------------------------------------------------------- orari --- */

uguale(
  "orari senza scavalco",
  { start_time: "09:00", end_time: "17:00" },
  orariDa(540, 480),
);
uguale(
  "la fine a mezzanotte esatta si scrive 00:00, non 24:00",
  { start_time: "16:00", end_time: "00:00" },
  orariDa(960, 480),
);

process.exit(errori > 0 ? 1 : 0);

/** Controlla la corrispondenza dei giorni nella copia dei turni.
 *    node scripts/prova-copia.mjs */
import { giorniCoinvolti, mondayOf } from "../src/lib/week.ts";

let errori = 0;
const uguale = (titolo, atteso, ottenuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto);
  if (!ok) errori++;
  console.log(`${ok ? "ok  " : "NO  "}${titolo}`);
  if (!ok) console.log(`      atteso   ${JSON.stringify(atteso)}\n      ottenuto ${JSON.stringify(ottenuto)}`);
};

// Una data qualunque dentro la settimana deve dare sempre lo stesso lunedi'.
uguale("mercoledi 19 ago -> lunedi 17", "2026-08-17", mondayOf("2026-08-19"));
uguale("domenica 23 ago -> lunedi 17", "2026-08-17", mondayOf("2026-08-23"));
uguale("lunedi 17 ago -> se stesso", "2026-08-17", mondayOf("2026-08-17"));

uguale("settimana: sette giorni da lunedi", [
  "2026-08-17","2026-08-18","2026-08-19","2026-08-20","2026-08-21","2026-08-22","2026-08-23",
], giorniCoinvolti("settimana", "2026-08-20"));

uguale("giorno: solo quello", ["2026-08-20"], giorniCoinvolti("giorno", "2026-08-20"));

// La corrispondenza e' per posizione, non per differenza di giorni: cosi'
// il lunedi' finisce sul lunedi' anche saltando avanti di mesi, e anche se
// la distanza non e' un multiplo di sette.
const origine = giorniCoinvolti("settimana", "2026-08-19");
const destinazione = giorniCoinvolti("settimana", "2026-12-03");
const mappa = origine.map((d, i) => `${d} -> ${destinazione[i]}`);
uguale("agosto -> dicembre, giorno per giorno", [
  "2026-08-17 -> 2026-11-30",
  "2026-08-18 -> 2026-12-01",
  "2026-08-19 -> 2026-12-02",
  "2026-08-20 -> 2026-12-03",
  "2026-08-21 -> 2026-12-04",
  "2026-08-22 -> 2026-12-05",
  "2026-08-23 -> 2026-12-06",
], mappa);

// Cambio dell'ora legale: fra ottobre e novembre le lancette si spostano, e
// una copia fatta sommando millisecondi salterebbe o ripeterebbe un giorno.
uguale("a cavallo del cambio d'ora", [
  "2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-01",
], giorniCoinvolti("settimana", "2026-10-28"));

// Anno bisestile.
uguale("fine febbraio 2028 (bisestile)", [
  "2028-02-28","2028-02-29","2028-03-01","2028-03-02","2028-03-03","2028-03-04","2028-03-05",
], giorniCoinvolti("settimana", "2028-03-01"));

console.log("");
console.log(errori === 0 ? "tutto a posto" : `${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

/** «Quante ore si faranno davvero questa settimana» deve dare lo stesso
 *  numero ovunque la si chieda.
 *
 *  Fino al 29 agosto 2026 non era così: il Prospetto sommava anche i turni
 *  rifiutati, il tabellone e il telefono del dipendente no. Stessa persona,
 *  stessa settimana, due numeri su due schermate — e il salvataggio del
 *  turno successivo poteva dichiarare uno straordinario che il tabellone
 *  non vedeva.
 *
 *  Il 30 agosto 2026 e' saltato fuori che i conti erano cinque, non tre:
 *  la domanda che parte alla pubblicazione («questa settimana e' in
 *  straordinario?») sommava i turni grezzi, senza guardare ne' le assenze ne'
 *  i rifiuti — e viveva dentro la stessa `pubblicaSettimana` che il conto
 *  giusto lo faceva gia'. Questo controllo non lo vedeva perche' guardava
 *  solo i tre che conosceva: adesso ne guarda quattro.
 *
 *  Confronta i quattro conti sugli stessi dati e fallisce se divergono di un
 *  minuto:
 *    1. `siLavoreraDavvero` — la definizione, quella che usano il tabellone,
 *       la settimana del dipendente e la decisione sullo straordinario;
 *    2. `calcolaProspetto().righe[].totali.effettivi`;
 *    3. `chiStaSottoContratto()`, dove le ore fatte sono `dovuti - mancano`;
 *    4. `minutiPerPersona()`, cioe' le ore su cui la pubblicazione decide se
 *       chiedere conferma di uno straordinario.
 *
 *  In coda c'e' un quinto controllo, e non e' sui numeri: legge il **sorgente**
 *  di `chiediLaSettimanaAChiDeveRispondere` (`turni/actions.ts`) e fallisce se
 *  quel punto torna a farsi la somma in casa o a leggere i turni senza `date`
 *  e `rifiutato_at`. I quattro conti qui sopra provano la funzione, e il buco
 *  del 30 agosto 2026 non era nella funzione: era in chi non la chiamava.
 *
 *    node --import ./scripts/alias.mjs scripts/prova-ore-effettive.mjs */
import { readFileSync } from "node:fs";
import { durationMinutes } from "../src/lib/date.ts";
import { minutiPerPersona, siLavoreraDavvero } from "../src/lib/ore-effettive.ts";
import { calcolaProspetto } from "../src/lib/prospetto.ts";
import { chiStaSottoContratto } from "../src/lib/pubblicazione.ts";

let errori = 0;
const uguale = (titolo, atteso, ottenuto) => {
  const ok = atteso === ottenuto;
  if (!ok) errori++;
  console.log(`${ok ? "ok  " : "NO  "}${titolo}`);
  if (!ok) console.log(`      atteso ${atteso}, ottenuto ${ottenuto}`);
};

const GIORNI = [
  "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
  "2026-08-28", "2026-08-29", "2026-08-30",
];

const PERSONA = {
  id: "ada",
  full_name: "Ada",
  department_id: null,
  contract_hours: 40,
  on_call: false,
};

/** I quattro conti sugli stessi dati. Ritorna i quattro numeri, che devono
 *  coincidere. */
function conti(turni, assenze) {
  const definizione = turni
    .filter((t) => siLavoreraDavvero(t, assenze))
    .reduce((n, t) => n + durationMinutes(t.start_time, t.end_time), 0);

  const prospetto = calcolaProspetto({
    da: GIORNI[0],
    a: GIORNI[6],
    persone: [PERSONA],
    reparti: [],
    turni,
    assenze,
  });

  const sotto = chiStaSottoContratto({
    persone: [PERSONA],
    turni,
    assenze,
    giorni: GIORNI,
  })[0];

  return {
    definizione,
    prospetto: prospetto.righe[0].totali.effettivi,
    // Il conto della domanda alla pubblicazione: e' quello che per un anno
    // ha sommato anche le ore delle assenze e dei no.
    domanda: minutiPerPersona(turni, assenze).get(PERSONA.id) ?? 0,
    // Compare solo se la persona sta sotto contratto: sopra, la funzione non
    // la nomina proprio e non c'è niente da confrontare.
    pubblicazione: sotto ? sotto.dovuti - sotto.mancano : null,
  };
}

const turno = (giorno, da, a, rifiutato = null) => ({
  profile_id: PERSONA.id,
  date: giorno,
  start_time: da,
  end_time: a,
  rifiutato_at: rifiutato,
});
const assenza = (da, a) => ({
  id: `ass-${da}`,
  profile_id: PERSONA.id,
  type: "malattia",
  start_date: da,
  end_date: a,
});

/* ------------------------------------------------------- i casi a mano -- */

{
  // Cinque giornate da otto ore, una rifiutata: trentadue ore, non quaranta.
  const turni = GIORNI.slice(0, 5).map((g, i) =>
    turno(g, "09:00:00", "17:00:00", i === 2 ? "2026-08-20T10:00:00Z" : null),
  );
  const c = conti(turni, []);
  uguale("un rifiuto: la definizione toglie le sue ore", 32 * 60, c.definizione);
  uguale("un rifiuto: il Prospetto dà lo stesso numero", c.definizione, c.prospetto);
  uguale("un rifiuto: la pubblicazione dà lo stesso numero", c.definizione, c.pubblicazione);
  uguale("un rifiuto: la domanda alla pubblicazione dà lo stesso numero", c.definizione, c.domanda);
}

{
  // Un rifiuto e un giorno di assenza che ne copre un altro: sedici ore.
  const turni = GIORNI.slice(0, 4).map((g, i) =>
    turno(g, "09:00:00", "17:00:00", i === 0 ? "2026-08-20T10:00:00Z" : null),
  );
  const c = conti(turni, [assenza(GIORNI[1], GIORNI[1])]);
  uguale("rifiuto e assenza: la definizione", 16 * 60, c.definizione);
  uguale("rifiuto e assenza: il Prospetto", c.definizione, c.prospetto);
  uguale("rifiuto e assenza: la pubblicazione", c.definizione, c.pubblicazione);
  uguale("rifiuto e assenza: la domanda alla pubblicazione", c.definizione, c.domanda);
}

{
  // Il turno che scavalca la mezzanotte non deve dividere i due conti: uno
  // usa `durationMinutes`, l'altro il suo calcolo interno.
  const turni = [turno(GIORNI[0], "22:00:00", "06:00:00")];
  const c = conti(turni, []);
  uguale("oltre la mezzanotte: la definizione", 8 * 60, c.definizione);
  uguale("oltre la mezzanotte: il Prospetto", c.definizione, c.prospetto);
  uguale("oltre la mezzanotte: la domanda alla pubblicazione", c.definizione, c.domanda);
}

{
  // Il caso che nessuno vedeva: la persona e' assente tutta la settimana e i
  // suoi turni restano a tabellone apposta, perche' sono il buco da coprire.
  // Il vecchio conto li sommava e faceva partire la domanda «questa settimana
  // sei in straordinario» a chi quella settimana non c'e'.
  const turni = GIORNI.slice(0, 5).map((g) => turno(g, "08:00:00", "20:00:00"));
  const c = conti(turni, [assenza(GIORNI[0], GIORNI[6])]);
  uguale("assente tutta la settimana: zero ore, non sessanta", 0, c.definizione);
  uguale("assente tutta la settimana: la domanda alla pubblicazione", 0, c.domanda);
}

/* ------------------------------------------- e una spazzolata a caso ---- */

/** Generatore ripetibile: un controllo che cambia a ogni esecuzione non si
 *  può indagare quando fallisce. */
let seme = 20260829;
const caso = (n) => {
  seme = (seme * 1103515245 + 12345) % 2147483648;
  return seme % n;
};

let confrontati = 0;
for (let giro = 0; giro < 300; giro++) {
  const turni = GIORNI.filter(() => caso(10) < 7).map((g) =>
    turno(g, `${String(6 + caso(6)).padStart(2, "0")}:00:00`, "17:00:00",
      caso(10) < 3 ? "2026-08-20T10:00:00Z" : null),
  );
  const assenze = caso(10) < 4
    ? [assenza(GIORNI[caso(4)], GIORNI[3 + caso(4)])]
    : [];

  const c = conti(turni, assenze);
  if (c.definizione !== c.domanda) {
    errori++;
    console.log(`NO  giro ${giro}: definizione ${c.definizione}, domanda ${c.domanda}`);
    console.log(`      ${JSON.stringify({ turni, assenze })}`);
    break;
  }
  if (c.definizione !== c.prospetto) {
    errori++;
    console.log(`NO  giro ${giro}: definizione ${c.definizione}, Prospetto ${c.prospetto}`);
    console.log(`      ${JSON.stringify({ turni, assenze })}`);
    break;
  }
  if (c.pubblicazione !== null) {
    confrontati++;
    if (c.definizione !== c.pubblicazione) {
      errori++;
      console.log(`NO  giro ${giro}: definizione ${c.definizione}, pubblicazione ${c.pubblicazione}`);
      console.log(`      ${JSON.stringify({ turni, assenze })}`);
      break;
    }
  }
}
uguale("la spazzolata ha davvero confrontato la pubblicazione", true, confrontati > 0);
console.log(`ok  300 settimane a caso, quattro conti uguali (${confrontati} col terzo)`);

/* ------------------------------------------ e adesso il punto di chiamata -- */

// I casi qui sopra provano la *funzione*. Il buco del 30 agosto 2026 non era
// nella funzione: era che un punto la somma se la rifaceva in casa, con una
// `select` che non leggeva nemmeno le colonne per accorgersi di un'assenza o
// di un no. Provare solo la funzione non lo avrebbe visto — e infatti non lo
// aveva visto. Quindi si guarda anche il sorgente di quel punto.
const FONTE = readFileSync(
  new URL("../src/app/(app)/turni/actions.ts", import.meta.url),
  "utf8",
);
const da = FONTE.indexOf("async function chiediLaSettimanaAChiDeveRispondere");
const a = FONTE.indexOf("/* ---", da);
const CORPO = da >= 0 && a > da ? FONTE.slice(da, a) : "";

uguale("il punto di chiamata si legge davvero", true, CORPO.length > 500);
uguale(
  "la domanda alla pubblicazione passa da minutiPerPersona",
  true,
  CORPO.includes("minutiPerPersona("),
);
// Una somma fatta in casa dentro questa funzione è esattamente il vecchio
// conto che tornava. Fuori di qui `durationMinutes` è legittimo: là i turni
// sono già passati da `siLavoreraDavvero`.
uguale(
  "e non si rifà la somma per conto suo",
  false,
  /durationMinutes\s*\(/.test(CORPO),
);
// Senza queste due colonne la somma è giusta come funzione e sbagliata come
// dato: `date` è l'unico modo di sapere se quel giorno la persona c'era.
for (const colonna of ["date", "rifiutato_at"]) {
  uguale(
    `la select dei turni porta ${colonna}`,
    true,
    new RegExp(`\\.select\\("[^"]*\\b${colonna}\\b`).test(CORPO),
  );
}
uguale("e legge le assenze", true, CORPO.includes('.from("absences")'));

console.log(errori === 0 ? "\nTutto a posto." : `\n${errori} controlli falliti.`);
process.exit(errori === 0 ? 0 : 1);

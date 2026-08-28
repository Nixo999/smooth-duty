/** Controlli sulle regole di ingaggio di chi è a chiamata: quando un turno
 *  si può assegnare, e quando no.
 *    node --import ./scripts/alias.mjs scripts/prova-disponibilita.mjs
 *
 *  È la regola che decide se il responsabile può scrivere in una casella, e
 *  gira senza browser e senza database perché è lì che si vedono i casi che
 *  a mano nessuno proverebbe: il turno di notte, la fascia attaccata a
 *  un'altra, la dichiarazione rimasta dal regime di prima. */
import {
  descriviStato,
  esitoAssegnazione,
  statoDelGiorno,
  versoDelRegime,
} from "../src/lib/disponibilita.ts";

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

/* Giovedì 3 e venerdì 4 settembre 2026. */
const GIO = "2026-09-03";
const VEN = "2026-09-04";

const turno = (date, start_time, end_time) => ({ date, start_time, end_time });

/** Tutto il giorno. */
const tutto = (giorno, verso) => ({ giorno, dalle: null, alle: null, verso });
/** Una fascia dentro il giorno. */
const fascia = (giorno, dalle, alle, verso) => ({ giorno, dalle, alle, verso });

const prova = (o) =>
  esitoAssegnazione({
    regime: o.regime,
    aChiamata: o.aChiamata ?? true,
    turno: o.turno,
    dichiarazioni: o.dichiarazioni ?? [],
  });

const ok = { ok: true };
const no = (motivo, giorno, fasce = []) => ({ ok: false, motivo, giorno, fasce });

/* ------------------------------------------------ chi non riguarda --- */

uguale(
  "chi ha un contratto a ore non ha un calendario da rispettare",
  ok,
  prova({
    regime: "indisponibilita",
    aChiamata: false,
    turno: turno(GIO, "09:00", "17:00"),
    dichiarazioni: [tutto(GIO, "non_posso")],
  }),
);

uguale(
  "con «chiedi ogni volta» il calendario non si guarda proprio",
  ok,
  prova({
    regime: "on_demand",
    turno: turno(GIO, "09:00", "17:00"),
    dichiarazioni: [tutto(GIO, "non_posso")],
  }),
);

uguale("e infatti on_demand non legge nessun verso", null, versoDelRegime("on_demand"));

/* ---------------------------------------------------- lista nera --- */

uguale(
  "senza dichiarazioni la lista nera non blocca niente",
  ok,
  prova({ regime: "indisponibilita", turno: turno(GIO, "09:00", "17:00") }),
);

uguale(
  "il giorno segnato per intero blocca il turno",
  no("indisponibile", GIO),
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "09:00", "17:00"),
    dichiarazioni: [tutto(GIO, "non_posso")],
  }),
);

uguale(
  "una fascia che non si tocca col turno lascia passare",
  ok,
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "09:00", "13:00"),
    dichiarazioni: [fascia(GIO, "14:00", "18:00", "non_posso")],
  }),
);

// Basta un minuto: chi ha detto «dalle 14 non ci sono» non c'e' nemmeno
// per l'ultimo quarto d'ora.
uguale(
  "una fascia che si sovrappone anche solo in coda blocca",
  no("indisponibile", GIO, [{ dalle: "14:00", alle: "18:00" }]),
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "09:00", "14:30"),
    dichiarazioni: [fascia(GIO, "14:00", "18:00", "non_posso")],
  }),
);

// Il turno che finisce dove comincia l'impegno non lo tocca: gli intervalli
// sono chiusi a sinistra e aperti a destra, come le fette della copertura.
uguale(
  "il turno che finisce quando comincia l'impegno passa",
  ok,
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "09:00", "14:00"),
    dichiarazioni: [fascia(GIO, "14:00", "18:00", "non_posso")],
  }),
);

/* ----------------------------------------- il turno che scavalca --- */

uguale(
  "un turno di notte lo blocca anche il giorno dopo",
  no("indisponibile", VEN),
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "22:00", "06:00"),
    dichiarazioni: [tutto(VEN, "non_posso")],
  }),
);

// Se finisse a mezzanotte esatta il giorno dopo non lo tocca, e segnarcelo
// lo farebbe sbattere contro le dichiarazioni di una giornata in cui non
// mette piede.
uguale(
  "il turno che finisce a mezzanotte non tocca il giorno dopo",
  ok,
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "18:00", "00:00"),
    dichiarazioni: [tutto(VEN, "non_posso")],
  }),
);

/* -------------------------------------- le dichiarazioni dell'altro verso
 *
 * Il verso sta sulla riga apposta: cambiando regime, quello che si e' detto
 * prima resta scritto e smette di contare. Un elenco di soli giorni si
 * sarebbe rovesciato di senso in silenzio. */

uguale(
  "sotto la lista nera un «posso» rimasto dal regime di prima non blocca",
  ok,
  prova({
    regime: "indisponibilita",
    turno: turno(GIO, "09:00", "17:00"),
    dichiarazioni: [tutto(GIO, "posso")],
  }),
);

uguale(
  "e sotto la lista bianca un «non posso» rimasto non vale come disponibilità",
  no("nessuna_disponibilita", GIO),
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "09:00", "17:00"),
    dichiarazioni: [tutto(GIO, "non_posso")],
  }),
);

/* -------------------------------------------------- lista bianca --- */

uguale(
  "senza dichiarazioni la lista bianca non lascia assegnare niente",
  no("nessuna_disponibilita", GIO),
  prova({ regime: "disponibilita", turno: turno(GIO, "09:00", "17:00") }),
);

uguale(
  "il giorno dichiarato per intero copre qualunque turno",
  ok,
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "06:00", "23:00"),
    dichiarazioni: [tutto(GIO, "posso")],
  }),
);

uguale(
  "dentro la fascia si può assegnare",
  ok,
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "18:00", "22:00"),
    dichiarazioni: [fascia(GIO, "18:00", "23:00", "posso")],
  }),
);

// Qui non basta toccarsi: assegnare 17–22 a chi ha detto «dalle 18 posso»
// vorrebbe dire dare per buona un'ora che non ha mai concesso.
uguale(
  "un turno che comincia un'ora prima della disponibilità non passa",
  no("fuori_disponibilita", GIO, [{ dalle: "18:00", alle: "23:00" }]),
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "17:00", "22:00"),
    dichiarazioni: [fascia(GIO, "18:00", "23:00", "posso")],
  }),
);

// Due fasce attaccate coprono un turno che nessuna delle due copre da sola:
// e' il motivo per cui gli intervalli si uniscono prima di guardarli.
uguale(
  "due fasce attaccate coprono il turno che le attraversa",
  ok,
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "08:00", "18:00"),
    dichiarazioni: [
      fascia(GIO, "08:00", "12:00", "posso"),
      fascia(GIO, "12:00", "18:00", "posso"),
    ],
  }),
);

uguale(
  "due fasce staccate no: in mezzo c'è un buco che nessuno ha concesso",
  no("fuori_disponibilita", GIO, [
    { dalle: "08:00", alle: "12:00" },
    { dalle: "14:00", alle: "18:00" },
  ]),
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "08:00", "18:00"),
    dichiarazioni: [
      fascia(GIO, "08:00", "12:00", "posso"),
      fascia(GIO, "14:00", "18:00", "posso"),
    ],
  }),
);

uguale(
  "il turno di notte ha bisogno di tutt'e due i giorni",
  no("nessuna_disponibilita", VEN),
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "22:00", "06:00"),
    dichiarazioni: [tutto(GIO, "posso")],
  }),
);

uguale(
  "con tutt'e due i giorni dichiarati il turno di notte passa",
  ok,
  prova({
    regime: "disponibilita",
    turno: turno(GIO, "22:00", "06:00"),
    dichiarazioni: [tutto(GIO, "posso"), tutto(VEN, "posso")],
  }),
);

/* ------------------------------------------------ il calendario --- */

const stato = (o) =>
  statoDelGiorno({
    regime: o.regime,
    dichiarazioni: o.dichiarazioni,
    giorno: o.giorno ?? GIO,
  });

uguale(
  "un giorno senza dichiarazioni non ha niente da disegnare",
  null,
  stato({ regime: "indisponibilita", dichiarazioni: [] }),
);

uguale(
  "il giorno intero si riconosce dal giorno intero",
  { verso: "non_posso", intero: true, fasce: [] },
  stato({ regime: "indisponibilita", dichiarazioni: [tutto(GIO, "non_posso")] }),
);

uguale(
  "le fasce arrivano come le ha scritte la persona, non unite",
  {
    verso: "posso",
    intero: false,
    fasce: [
      { dalle: "08:00", alle: "12:00" },
      { dalle: "14:00", alle: "18:00" },
    ],
  },
  stato({
    regime: "disponibilita",
    dichiarazioni: [
      fascia(GIO, "08:00", "12:00", "posso"),
      fascia(GIO, "14:00", "18:00", "posso"),
    ],
  }),
);

uguale(
  "sotto on_demand il calendario non ha niente da dire",
  null,
  stato({ regime: "on_demand", dichiarazioni: [tutto(GIO, "non_posso")] }),
);

uguale(
  "e si racconta con le parole del verso in cui è stato scritto",
  "Disponibile 18:00–23:00",
  descriviStato({
    verso: "posso",
    intero: false,
    fasce: [{ dalle: "18:00", alle: "23:00" }],
  }),
);

console.log(errori === 0 ? "\ntutto a posto" : `\n${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

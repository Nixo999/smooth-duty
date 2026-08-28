/** Controlli sul motore che propone i turni di una settimana.
 *    node --import ./scripts/alias.mjs scripts/prova-generazione.mjs
 *
 *  Ogni caso qui dentro e' una decisione del motore che non si deduce dal
 *  codice: quale persona sceglie, quanto allarga un buco, quando rinuncia e
 *  come lo dice. */
import {
  generaTurni,
  MASSIMO_AL_GIORNO,
  MASSIMO_TURNO,
  MINIMO_TURNO,
} from "../src/lib/generazione.ts";

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

const LUNEDI = "2026-08-24";
const SALA = "rep-sala";
const CASSA = "rep-cassa";

/* Scorciatoie per scrivere i casi senza rumore. */
const fascia = (o = {}) => ({
  id: o.id ?? "f1",
  department_id: o.reparto ?? SALA,
  name: o.nome ?? "Mattina",
  start_time: o.da ?? "09:00:00",
  end_time: o.a ?? "17:00:00",
  required: o.quanti ?? 1,
  weekdays: o.giorni ?? [1],
});
const persona = (nome, o = {}) => ({
  id: o.id ?? nome.toLowerCase(),
  full_name: nome,
  department_id: o.reparto ?? SALA,
  reparti: o.reparti ?? (o.reparto ? [o.reparto] : [SALA]),
  contract_hours: o.ore === undefined ? 40 : o.ore,
  on_call: o.chiamata ?? false,
  dichiarazioni: o.dichiarazioni ?? [],
});
/** Tutto il giorno, nel verso indicato. */
const dice = (giorno, verso) => ({ giorno, dalle: null, alle: null, verso });
const turno = (o) => ({
  id: o.id ?? "t1",
  profile_id: o.chi ?? null,
  date: o.giorno,
  start_time: o.da,
  end_time: o.a,
  title: null,
  department_id: o.reparto ?? SALA,
});
const assenza = (o) => ({
  id: o.id ?? "a1",
  profile_id: o.chi,
  type: o.tipo ?? "malattia",
  start_date: o.da,
  end_date: o.a ?? null,
});

const genera = (o) =>
  generaTurni({
    lunedi: LUNEDI,
    persone: o.persone ?? [],
    fasce: o.fasce ?? [],
    turni: o.turni ?? [],
    assenze: o.assenze ?? [],
    regime: o.regime,
  });

/** Le proposte in forma leggibile: giorno, orario, chi. */
const righe = (g) =>
  g.proposte.map((p) => `${p.date} ${p.start_time}-${p.end_time} ${p.profile_id}`);
const buchi = (g) =>
  g.scoperti.map((s) => `${s.date} ${s.start_time}-${s.end_time} ${s.motivo}`);

/* ------------------------------------------------------ il caso semplice */

uguale(
  "una fascia scoperta diventa un turno",
  ["2026-08-24 09:00-17:00 anna"],
  righe(genera({ persone: [persona("Anna")], fasce: [fascia()] })),
);

uguale(
  "una fascia gia' coperta non propone niente",
  [],
  righe(
    genera({
      persone: [persona("Anna")],
      fasce: [fascia()],
      turni: [turno({ giorno: LUNEDI, da: "09:00:00", a: "17:00:00", chi: "anna" })],
    }),
  ),
);

uguale(
  "si copre solo il pezzo che manca, non tutta la fascia",
  ["2026-08-24 13:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia()],
      turni: [turno({ giorno: LUNEDI, da: "09:00:00", a: "13:00:00", chi: "anna" })],
    }),
  ),
);

uguale(
  "una fascia che vuole due persone produce due turni, non uno da due",
  ["2026-08-24 09:00-17:00 anna", "2026-08-24 09:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia({ quanti: 2 })],
    }),
  ),
);

/* -------------------------------------------------------------- assenze */

uguale(
  "a chi e' assente non si propone niente",
  ["2026-08-24 09:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia()],
      assenze: [assenza({ chi: "anna", da: "2026-08-20" })],
    }),
  ),
);

uguale(
  "il turno di un assente non copre: il buco resta e si propone a un altro",
  ["2026-08-24 09:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia()],
      turni: [turno({ giorno: LUNEDI, da: "09:00:00", a: "17:00:00", chi: "anna" })],
      assenze: [assenza({ chi: "anna", da: "2026-08-24", a: "2026-08-28" })],
    }),
  ),
);

/* -------------------------------------------------------------- reparti */

uguale(
  "chi non lavora in quel reparto non viene proposto",
  ["nessuno_nel_reparto"],
  genera({
    persone: [persona("Anna", { reparto: SALA })],
    fasce: [fascia({ reparto: CASSA })],
  }).scoperti.map((s) => s.motivo),
);

uguale(
  "chi ha due reparti copre quello che serve",
  ["2026-08-24 09:00-17:00 anna"],
  righe(
    genera({
      persone: [persona("Anna", { reparto: SALA, reparti: [SALA, CASSA] })],
      fasce: [fascia({ reparto: CASSA })],
    }),
  ),
);

uguale(
  "chi ha il reparto come principale viene prima di chi ci va di rinforzo",
  ["2026-08-24 09:00-17:00 bruno"],
  righe(
    genera({
      persone: [
        persona("Anna", { reparto: SALA, reparti: [SALA, CASSA] }),
        persona("Bruno", { reparto: CASSA, reparti: [CASSA] }),
      ],
      fasce: [fascia({ reparto: CASSA })],
    }),
  ),
);

uguale(
  "una persona sola non copre due reparti nella stessa ora",
  {
    proposte: ["2026-08-24 09:00-17:00 anna"],
    scoperti: ["2026-08-24 09:00-17:00 tutti_occupati"],
  },
  (() => {
    const g = genera({
      persone: [persona("Anna", { reparti: [SALA, CASSA] })],
      fasce: [
        fascia({ id: "f1", reparto: SALA }),
        fascia({ id: "f2", reparto: CASSA }),
      ],
    });
    return { proposte: righe(g), scoperti: buchi(g) };
  })(),
);

/* ------------------------------------------------------------ contratto */

uguale(
  "il monte ore non si supera: il secondo giorno resta scoperto",
  {
    proposte: ["2026-08-24 09:00-17:00 anna"],
    scoperti: ["2026-08-25 09:00-17:00 oltre_contratto"],
  },
  (() => {
    const g = genera({
      persone: [persona("Anna", { ore: 8 })],
      fasce: [fascia({ giorni: [1, 2] })],
    });
    return { proposte: righe(g), scoperti: buchi(g) };
  })(),
);

uguale(
  "chi e' a chiamata si usa dopo chi ha un contratto da riempire",
  ["2026-08-24 09:00-17:00 anna"],
  righe(
    genera({
      persone: [
        persona("Anna", { ore: 40 }),
        persona("Bruno", { ore: null, chiamata: true }),
      ],
      fasce: [fascia()],
    }),
  ),
);

uguale(
  "finite le ore contrattuali, si chiama chi e' a chiamata",
  ["2026-08-24 09:00-17:00 bruno"],
  righe(
    genera({
      persone: [
        persona("Anna", { ore: 8 }),
        persona("Bruno", { ore: null, chiamata: true }),
      ],
      fasce: [fascia({ giorni: [1] })],
      turni: [turno({ giorno: LUNEDI, da: "22:00:00", a: "06:00:00", chi: "anna", reparto: CASSA })],
    }),
  ),
);

uguale(
  "chi e' piu' sotto le sue ore viene prima",
  ["2026-08-25 09:00-17:00 bruno"],
  righe(
    genera({
      // Anna ha gia' lavorato lunedi', Bruno no: martedi' tocca a Bruno.
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia({ giorni: [2] })],
      turni: [turno({ giorno: LUNEDI, da: "09:00:00", a: "17:00:00", chi: "anna" })],
    }),
  ),
);

/* -------------------------------------------------- lunghezza dei turni */

uguale(
  `un buco piu' corto di ${MINIMO_TURNO} minuti si allarga dentro la fascia`,
  ["2026-08-24 15:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia()],
      turni: [turno({ giorno: LUNEDI, da: "09:00:00", a: "16:45:00", chi: "anna" })],
    }),
  ),
);

uguale(
  `oltre ${MASSIMO_TURNO} minuti il turno si spezza fra due persone`,
  ["2026-08-24 08:00-15:00 anna", "2026-08-24 15:00-22:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia({ da: "08:00:00", a: "22:00:00" })],
    }),
  ),
);

uguale(
  `una persona sola non fa ${MASSIMO_AL_GIORNO / 60} ore in un giorno: il resto e' scoperto`,
  {
    proposte: ["2026-08-24 08:00-15:00 anna"],
    scoperti: ["2026-08-24 15:00-22:00 tutti_occupati"],
  },
  (() => {
    const g = genera({
      persone: [persona("Anna")],
      fasce: [fascia({ da: "08:00:00", a: "22:00:00" })],
    });
    return { proposte: righe(g), scoperti: buchi(g) };
  })(),
);

/* ----------------------------------------------------------- la notte */

uguale(
  "una fascia che scavalca la mezzanotte e' un turno solo, non due",
  ["2026-08-24 18:00-02:00 anna"],
  righe(
    genera({
      persone: [persona("Anna")],
      fasce: [fascia({ da: "18:00:00", a: "02:00:00" })],
    }),
  ),
);

// Anna smonta alle 10:00, quindi le 09:00-10:00 sono coperte da lei: il buco
// comincia alle 10:00. E quel buco non e' suo — fra la notte e il turno dopo
// ci vogliono undici ore.
uguale(
  "chi ha fatto la notte copre la prima ora, ma non prende il turno dopo",
  ["2026-08-25 10:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia({ da: "09:00:00", a: "17:00:00", giorni: [2] })],
      turni: [
        turno({ id: "t9", giorno: LUNEDI, da: "22:00:00", a: "10:00:00", chi: "anna" }),
      ],
    }),
  ),
);

uguale(
  "un turno della domenica prima si porta dietro il riposo, dentro la settimana",
  ["2026-08-24 10:00-17:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia()],
      turni: [
        turno({ id: "t8", giorno: "2026-08-23", da: "22:00:00", a: "10:00:00", chi: "anna" }),
      ],
    }),
  ),
);

uguale(
  "chiusura la sera e apertura la mattina dopo: no",
  ["2026-08-25 09:00-13:00 bruno"],
  righe(
    genera({
      persone: [persona("Anna"), persona("Bruno")],
      fasce: [fascia({ da: "09:00:00", a: "13:00:00", giorni: [2] })],
      turni: [turno({ giorno: LUNEDI, da: "16:00:00", a: "00:00:00", chi: "anna" })],
    }),
  ),
);

uguale(
  "mattina e sera nello stesso giorno invece si', ed e' il turno spezzato",
  ["2026-08-24 09:00-13:00 anna", "2026-08-24 18:00-22:00 anna"],
  righe(
    genera({
      persone: [persona("Anna")],
      fasce: [
        fascia({ id: "f1", da: "09:00:00", a: "13:00:00" }),
        fascia({ id: "f2", da: "18:00:00", a: "22:00:00" }),
      ],
    }),
  ),
);

/* -------------------------------------------------- chi e' a chiamata */

// Il motore non deve proporre quello che il salvataggio poi rifiuta: un
// generatore che riempie il tabellone di turni impossibili e' peggio di
// nessun generatore, perche' il responsabile lo guarda pieno e smette di
// controllare.
uguale(
  "chi ha segnato che quel giorno non c'e' non viene proposto",
  ["2026-08-24 09:00-17:00 non_disponibile"],
  buchi(
    genera({
      regime: "indisponibilita",
      persone: [
        persona("Anna", { chiamata: true, ore: null, dichiarazioni: [dice(LUNEDI, "non_posso")] }),
      ],
      fasce: [fascia()],
    }),
  ),
);

uguale(
  "e chi non ha dato disponibilita', sotto la lista bianca, nemmeno",
  ["2026-08-24 09:00-17:00 non_disponibile"],
  buchi(
    genera({
      regime: "disponibilita",
      persone: [persona("Anna", { chiamata: true, ore: null })],
      fasce: [fascia()],
    }),
  ),
);

uguale(
  "chi invece si e' reso disponibile viene proposto come chiunque",
  ["2026-08-24 09:00-17:00 anna"],
  righe(
    genera({
      regime: "disponibilita",
      persone: [
        persona("Anna", { chiamata: true, ore: null, dichiarazioni: [dice(LUNEDI, "posso")] }),
      ],
      fasce: [fascia()],
    }),
  ),
);

// Il motivo distingue «non c'e' nessuno che possa venire» da «ci sono ma
// hanno gia' il loro»: i due rimedi non si somigliano.
uguale(
  "«non disponibile» e «tutti occupati» restano due cose diverse",
  ["2026-08-24 09:00-17:00 tutti_occupati"],
  buchi(
    genera({
      regime: "indisponibilita",
      // In sala manca una persona, e l'unica che saprebbe farlo quel giorno
      // sta in cassa: e' disponibile, ma non e' libera.
      persone: [
        persona("Anna", { chiamata: true, ore: null, reparto: SALA, reparti: [SALA, CASSA] }),
      ],
      fasce: [fascia()],
      turni: [
        turno({
          chi: "anna",
          giorno: LUNEDI,
          da: "09:00:00",
          a: "17:00:00",
          reparto: CASSA,
        }),
      ],
    }),
  ),
);

/* ------------------------------------------------------- ripetibilita' */

uguale(
  "due giri sugli stessi dati danno lo stesso tabellone",
  true,
  (() => {
    const dati = {
      persone: [persona("Anna"), persona("Bruno"), persona("Carla")],
      fasce: [fascia({ quanti: 2, giorni: [1, 2, 3, 4, 5] })],
    };
    return JSON.stringify(genera(dati)) === JSON.stringify(genera(dati));
  })(),
);

/* --------------------------------------------------------------- fine */

console.log(errori === 0 ? "\ntutto a posto" : `\n${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

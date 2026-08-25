/** Controlli su che cosa comporta, per l'interessato, il salvataggio di un
 *  turno: si chiede, si avvisa, o non si dice niente.
 *    node --import ./scripts/alias.mjs scripts/prova-conferme.mjs
 *
 *  E' la regola che il 26 agosto 2026 ha smesso di guardare solo "e'
 *  cambiato?" e ha cominciato a guardare **in che verso**. */
import { conseguenzaDelSalvataggio } from "../src/lib/conferme.ts";
import { IMPOSTAZIONI_DEFAULT } from "../src/lib/impostazioni.ts";

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

const imp = (o = {}) => ({ ...IMPOSTAZIONI_DEFAULT, ...o });
const turno = (da, a, giorno = "2026-08-24") => ({
  date: giorno,
  start_time: da,
  end_time: a,
  minuti:
    (Number(a.slice(0, 2)) * 60 + Number(a.slice(3))) -
    (Number(da.slice(0, 2)) * 60 + Number(da.slice(3))),
});

const esito = (o) =>
  conseguenzaDelSalvataggio({
    prima: o.prima ?? null,
    dopo: o.dopo,
    soloReparto: o.soloReparto ?? false,
    pubblicata: o.pubblicata ?? false,
    straordinario: o.straordinario ?? false,
    fuoriPreset: o.fuoriPreset ?? false,
    imp: o.imp ?? imp(),
  });

const rifiutabile = (motivo) => ({ tipo: "rifiutabile", motivo });
const avviso = (motivo) => ({ tipo: "avviso", motivo });
const niente = { tipo: "niente" };

/* ---------------------------------------------------------- in bozza --- */

uguale(
  "in bozza non si chiede niente a nessuno",
  niente,
  esito({
    prima: turno("09:00", "13:00"),
    dopo: turno("09:00", "20:00"),
    pubblicata: false,
    straordinario: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

/* --------------------------------------------------- il verso conta --- */

uguale(
  "settimana pubblicata, piu' ore: si puo' rifiutare",
  rifiutabile("modifica"),
  esito({
    prima: turno("09:00", "13:00"),
    dopo: turno("09:00", "17:00"),
    pubblicata: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "settimana pubblicata, meno ore: si avvisa e basta",
  avviso("ore_tolte"),
  esito({
    prima: turno("09:00", "17:00"),
    dopo: turno("09:00", "13:00"),
    pubblicata: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "meno ore restando comunque in straordinario: sempre un avviso",
  avviso("ore_tolte"),
  esito({
    prima: turno("08:00", "22:00"),
    dopo: turno("08:00", "20:00"),
    pubblicata: true,
    straordinario: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "stesse ore, altro giorno: si chiede, non si comunica",
  rifiutabile("turno_spostato"),
  esito({
    prima: turno("09:00", "13:00", "2026-08-24"),
    dopo: turno("09:00", "13:00", "2026-08-26"),
    pubblicata: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "dal mattino al pomeriggio, a ore identiche: si chiede",
  rifiutabile("turno_spostato"),
  esito({
    prima: turno("09:00", "13:00"),
    dopo: turno("14:00", "18:00"),
    pubblicata: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "salvare un turno senza cambiare niente non dice niente a nessuno",
  niente,
  esito({
    prima: turno("09:00", "13:00"),
    dopo: turno("09:00", "13:00"),
    pubblicata: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "con l'interruttore spento non arriva niente, ne' richiesta ne' avviso",
  niente,
  esito({
    prima: turno("09:00", "17:00"),
    dopo: turno("09:00", "13:00"),
    pubblicata: true,
    imp: imp({ conferma_modifiche: false }),
  }),
);

/* ------------------------------------------------------ straordinari --- */

// Il caso che fino al 26 agosto 2026 passava in silenzio: c'era una levetta
// apposta per gli straordinari, esclusiva, e chi accendeva solo quella
// generale non veniva avvisato proprio del caso piu' grosso.
uguale(
  "un interruttore solo copre anche le modifiche che sfondano il contratto",
  rifiutabile("modifica_straordinario"),
  esito({
    prima: turno("09:00", "13:00"),
    dopo: turno("09:00", "21:00"),
    pubblicata: true,
    straordinario: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "e il motivo distingue lo straordinario dalla modifica normale",
  rifiutabile("modifica"),
  esito({
    prima: turno("09:00", "13:00"),
    dopo: turno("09:00", "17:00"),
    pubblicata: true,
    straordinario: false,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "un turno nuovo che porta oltre il contratto si puo' rifiutare",
  rifiutabile("straordinario"),
  esito({
    dopo: turno("09:00", "17:00"),
    pubblicata: true,
    straordinario: true,
    imp: imp({ conferma_straordinari: true }),
  }),
);

/* ----------------------------------------------------------- reparto --- */

uguale(
  "cambiare solo il reparto, di suo, non si segnala",
  niente,
  esito({
    prima: turno("09:00", "17:00"),
    dopo: turno("09:00", "17:00"),
    soloReparto: true,
    pubblicata: true,
    imp: imp({ conferma_modifiche: true }),
  }),
);

uguale(
  "col suo interruttore acceso, il cambio di reparto si puo' rifiutare",
  rifiutabile("cambio_reparto"),
  esito({
    prima: turno("09:00", "17:00"),
    dopo: turno("09:00", "17:00"),
    soloReparto: true,
    pubblicata: true,
    straordinario: true,
    imp: imp({ conferma_cambio_reparto: true, conferma_modifiche: true }),
  }),
);

/* -------------------------------------------------- orario del contratto */

uguale(
  "orario diverso dal contratto: si puo' rifiutare",
  rifiutabile("orario_diverso"),
  esito({
    dopo: turno("14:00", "18:00"),
    fuoriPreset: true,
    imp: imp({ orari_preimpostati: true }),
  }),
);

uguale(
  "spegnere le modifiche non spegne anche gli orari preimpostati",
  rifiutabile("orario_diverso"),
  esito({
    prima: turno("09:00", "17:00"),
    dopo: turno("09:00", "13:00"),
    pubblicata: true,
    fuoriPreset: true,
    imp: imp({ conferma_modifiche: false, orari_preimpostati: true }),
  }),
);

uguale(
  "ma se l'avviso e' partito, l'orario non ci ripensa sopra",
  avviso("ore_tolte"),
  esito({
    prima: turno("09:00", "17:00"),
    dopo: turno("09:00", "13:00"),
    pubblicata: true,
    fuoriPreset: true,
    imp: imp({ conferma_modifiche: true, orari_preimpostati: true }),
  }),
);

console.log(errori === 0 ? "\ntutto a posto" : `\n${errori} controlli falliti`);
process.exit(errori === 0 ? 0 : 1);

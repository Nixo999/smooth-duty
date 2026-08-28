import type { Impostazioni } from "@/lib/impostazioni";
import type { MotivoAvviso, MotivoRifiuto, Shift } from "@/lib/types";

/** A che punto sta un turno rifiutabile.
 *
 *  Il turno vale comunque — è preapprovato, e chi tace ha accettato — ma per
 *  chi guarda il tabellone «non si è ancora espresso» e «ha detto di sì» non
 *  sono la stessa cosa: sabato sera sono due situazioni diverse.
 *
 *  La regola sta qui e non nei componenti perché la leggono il tabellone del
 *  responsabile, l'elenco del telefono e la settimana del dipendente: tre
 *  risposte diverse alla stessa domanda sarebbero un bug che si scopre
 *  guardando due schermate accanto. */
export type StatoConferma = "in_attesa" | "accettato" | "rifiutato";

/** null quando non c'è niente da dire: il turno è uno dei tanti. */
export function statoConferma(s: {
  richiede_conferma: Shift["richiede_conferma"];
  confermato_at: string | null;
  rifiutato_at: string | null;
}): StatoConferma | null {
  if (!s.richiede_conferma) return null;
  if (s.rifiutato_at) return "rifiutato";
  if (s.confermato_at) return "accettato";
  return "in_attesa";
}

/** Come si chiama sul tabellone: una parola, quella che si direbbe. */
export const ETICHETTA_CONFERMA: Record<StatoConferma, string> = {
  in_attesa: "in attesa",
  accettato: "accettato",
  rifiutato: "rifiutato",
};

/** La frase intera, per il titolo che compare passandoci sopra.
 *
 *  «In attesa» non promette che una risposta arriverà: sui giorni ormai
 *  passati non arriva più — il database non accetta né sì né no su quello
 *  che è già stato — e un testo che dicesse «può ancora rispondere»
 *  resterebbe lì a mentire per sempre. */
export const SPIEGA_CONFERMA: Record<StatoConferma, string> = {
  in_attesa: "Il turno vale, ma la persona non si è espressa né in un senso né nell'altro",
  accettato: "La persona ha guardato e ha detto di sì",
  rifiutato: "Rifiutato dalla persona: apri i messaggi in cima alla pagina",
};

/** Perché questo turno lo si può rifiutare, scritto come lo si direbbe.
 *  Il turno intanto vale: qui non si chiede un permesso, si segnala una cosa
 *  fuori dall'ordinario e si lascia la facoltà di dire di no.
 *
 *  ⚠️ Sta qui, e non nella schermata che la mostra, per una ragione tecnica
 *  oltre che di ordine. La leggono due componenti su lati opposti del
 *  confine: `MyWeek`, che gira sul server, e `Posta`, che gira nel browser.
 *  Finché `MyWeek` gliela passava come funzione, React sollevava — le
 *  funzioni non attraversano quel confine — e siccome succedeva nel render,
 *  la pagina del dipendente non si apriva affatto. Un modulo che importano
 *  tutti e due non ha quel problema, e resta una copia sola dell'elenco. */
export const MOTIVO_RIFIUTO: Record<MotivoRifiuto, string> = {
  straordinario: "Straordinario: va oltre le tue ore da contratto.",
  modifica: "Turno modificato dopo la pubblicazione della settimana.",
  modifica_straordinario:
    "Turno modificato, e ora va oltre le tue ore da contratto.",
  orario_diverso: "Orario diverso da quello del tuo contratto.",
  cambio_reparto: "Cambia il reparto: stesso orario, un altro posto.",
  turno_spostato: "Turno spostato: stesse ore, ma in un altro momento.",
  chiamata: "Sei stato chiamato per questo turno.",
};

/** Lo stesso, partendo dal turno. Stringa vuota quando non c'è niente da
 *  segnalare: è un turno come tutti gli altri. */
export function motivoDelTurno(turno: Pick<Shift, "richiede_conferma">): string {
  return turno.richiede_conferma ? MOTIVO_RIFIUTO[turno.richiede_conferma] : "";
}

/* ==================================================================== */

/** Che cosa comporta, per l'interessato, il salvataggio di un turno.
 *
 *  Fino al 26 agosto 2026 la domanda aveva una risposta sola — «è
 *  rifiutabile, sì o no» — e valeva in qualunque verso andasse la modifica.
 *  Ma **togliere ore a qualcuno e aggiungergliene non sono la stessa
 *  domanda**: chi si vede accorciare il turno non ha niente da concedere, ha
 *  diritto di saperlo. Chiedergli un permesso che non può che dare è un giro
 *  a vuoto; non dirgli niente è peggio.
 *
 *  Da qui tre esiti invece di due:
 *
 *  | Esito | Quando | Cosa vede l'interessato |
 *  |---|---|---|
 *  | `rifiutabile` | le ore aumentano, **o il turno si sposta** | può dire di no, e il responsabile riceve il messaggio |
 *  | `avviso` | le ore calano | «ho letto», e basta |
 *  | `niente` | il resto | niente |
 *
 *  E un caso che non è nessuno dei tre e sta prima di tutti: sotto il regime
 *  `on_demand` il turno di chi è a chiamata, su una settimana pubblicata, è
 *  una **chiamata** — si accetta o si rifiuta, e il silenzio non vale come
 *  un sì. Vedi `lib/disponibilita.ts`.
 *
 *  Funzione pura, apposta: la stessa domanda la fanno `salvaTurno`,
 *  l'eliminazione di un turno e — un domani — l'importazione. Tre risposte
 *  diverse sarebbero tre comportamenti diversi a seconda di come si è
 *  arrivati a cambiare lo stesso turno. */
export type Conseguenza =
  | { tipo: "rifiutabile"; motivo: MotivoRifiuto }
  | { tipo: "avviso"; motivo: MotivoAvviso }
  | { tipo: "niente" };

const NIENTE: Conseguenza = { tipo: "niente" };

export type TurnoConfrontabile = {
  date: string;
  start_time: string; // HH:MM
  end_time: string;
  /** La durata in minuti, già calcolata da chi chiama: qui non si rifà il
   *  conto degli orari, che ha già la sua funzione in `lib/date.ts`. */
  minuti: number;
};

export function conseguenzaDelSalvataggio(input: {
  /** Com'era. null = il turno sta nascendo adesso, e allora non c'è un
   *  «prima» da confrontare né da rimettere. */
  prima: TurnoConfrontabile | null;
  dopo: TurnoConfrontabile;
  /** È cambiato **solo** il reparto: stessa persona, stesso giorno, stessi
   *  orari. Decide da solo e chiude il discorso. */
  soloReparto: boolean;
  /** La settimana è già pubblicata. Prima della pubblicazione il tabellone è
   *  un foglio di lavoro e correggerlo non chiede niente a nessuno. */
  pubblicata: boolean;
  /** Dopo questo salvataggio la persona supera le ore da contratto. */
  straordinario: boolean;
  /** L'orario è diverso da quello preimpostato sul suo contratto. */
  fuoriPreset: boolean;
  /** La persona è a chiamata. Serve solo al regime `on_demand`: chi ha un
   *  monte ore non riceve chiamate, riceve turni. */
  aChiamata: boolean;
  imp: Impostazioni;
}): Conseguenza {
  const {
    prima,
    dopo,
    soloReparto,
    pubblicata,
    straordinario,
    fuoriPreset,
    aChiamata,
    imp,
  } = input;

  // Il cambio di reparto decide da solo: gli orari non si sono mossi, quindi
  // le regole sulle ore non hanno niente da dire. Spostare qualcuno dalla
  // cassa alla sala senza togliergli un minuto non è la modifica per cui si
  // disturba una persona.
  if (soloReparto) {
    return imp.conferma_cambio_reparto
      ? { tipo: "rifiutabile", motivo: "cambio_reparto" }
      : NIENTE;
  }

  // Chi è a chiamata, sotto il regime `on_demand`, su una settimana che la
  // squadra sta già guardando: quello non è un turno, è **una chiamata**, e
  // va accettata. Qui il verso non conta — più ore o meno ore, la proposta è
  // un'altra da quella a cui aveva detto di sì, e un turno accorciato che
  // scatta alle sei del mattino resta una cosa a cui si può dire di no.
  //
  // Sta prima delle regole sulle ore perché quelle parlano a chi un monte
  // ore ce l'ha: a chiamata non c'è straordinario da sfondare né orario da
  // contratto da rispettare, e sono proprio i due interruttori che qui non
  // hanno niente da dire. In bozza invece tace, come tutto il resto: la
  // domanda su una settimana ancora da pubblicare si fa una volta sola, ed è
  // la richiesta sulla settimana intera che nasce pubblicandola.
  if (imp.regime_chiamata === "on_demand" && aChiamata && pubblicata) {
    const cambiato =
      !prima ||
      prima.date !== dopo.date ||
      prima.start_time !== dopo.start_time ||
      prima.minuti !== dopo.minuti;
    // Salvato senza spostare niente: la chiamata è ancora quella di prima e
    // la risposta già data vale. Richiederla azzererebbe un sì per un
    // salvataggio che non ha cambiato la giornata di nessuno.
    return cambiato ? { tipo: "rifiutabile", motivo: "chiamata" } : NIENTE;
  }

  // Una modifica vera a una settimana pubblicata. È qui che il verso conta,
  // e un interruttore solo li governa tutti: `conferma_modifiche` vuol dire
  // «su questa settimana l'interessato viene coinvolto», e poi è la modifica
  // a decidere *come*. Fino al 26 agosto 2026 gli straordinari avevano una
  // levetta loro, esclusiva: chi accendeva quella generale non veniva
  // avvisato proprio del caso più grosso, ed era il contrario di quello che
  // uno si aspetta accendendo un interruttore.
  if (prima && pubblicata && imp.conferma_modifiche) {
    if (dopo.minuti > prima.minuti) {
      // Più ore: si chiede. Il motivo distingue comunque i due casi, perché
      // all'interessato non è indifferente sapere se quelle ore lo portano
      // oltre il contratto.
      return {
        tipo: "rifiutabile",
        motivo: straordinario ? "modifica_straordinario" : "modifica",
      };
    }
    if (dopo.minuti < prima.minuti) {
      // Meno ore: non si chiede niente, si avvisa. Vale **anche** se la
      // persona resta comunque oltre il contratto: quello che conta è che
      // questo salvataggio le toglie del lavoro, non dove si trova rispetto
      // alla soglia.
      return { tipo: "avviso", motivo: "ore_tolte" };
    }
    if (dopo.date !== prima.date || dopo.start_time !== prima.start_time) {
      // Stesse ore, altro giorno o altro orario — e **si chiede**, non si
      // comunica. Contare le ore e concludere che non è cambiato niente è un
      // ragionamento da contabile: il mattino e il pomeriggio non sono la
      // stessa giornata. Chi porta i figli a scuola alle otto, chi ha un
      // secondo lavoro, chi ha preso un impegno — per tutti loro un turno che
      // passa dalle 06–14 alle 14–22 cambia tutto, a ore identiche.
      return { tipo: "rifiutabile", motivo: "turno_spostato" };
    }
    // Salvato senza cambiare niente: non si disturba nessuno. Si continua,
    // perché l'orario fuori contratto qui sotto ha un interruttore suo.
  }

  // Un turno nuovo che porta oltre le ore da contratto.
  if (!prima && straordinario && imp.conferma_straordinari) {
    return { tipo: "rifiutabile", motivo: "straordinario" };
  }

  if (fuoriPreset && imp.orari_preimpostati) {
    return { tipo: "rifiutabile", motivo: "orario_diverso" };
  }

  return NIENTE;
}

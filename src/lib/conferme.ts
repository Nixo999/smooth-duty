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
 *  | `rifiutabile` | le ore aumentano | può dire di no, e il responsabile riceve il messaggio |
 *  | `avviso` | le ore calano, o si spostano a parità | «ho letto», e basta |
 *  | `niente` | il resto | niente |
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
  imp: Impostazioni;
}): Conseguenza {
  const { prima, dopo, soloReparto, pubblicata, straordinario, fuoriPreset, imp } =
    input;

  // Il cambio di reparto decide da solo: gli orari non si sono mossi, quindi
  // le regole sulle ore non hanno niente da dire. Spostare qualcuno dalla
  // cassa alla sala senza togliergli un minuto non è la modifica per cui si
  // disturba una persona.
  if (soloReparto) {
    return imp.conferma_cambio_reparto
      ? { tipo: "rifiutabile", motivo: "cambio_reparto" }
      : NIENTE;
  }

  // Una modifica vera a una settimana pubblicata. È qui che il verso conta.
  if (prima && pubblicata) {
    if (dopo.minuti > prima.minuti) {
      // Più ore: si chiede. I due interruttori si escludono a vicenda, come
      // sono nati: chi accende solo quello degli straordinari ha detto che
      // le modifiche normali le fa senza chiedere.
      if (straordinario) {
        if (imp.conferma_modifiche_straordinari) {
          return { tipo: "rifiutabile", motivo: "modifica_straordinario" };
        }
      } else if (imp.conferma_modifiche) {
        return { tipo: "rifiutabile", motivo: "modifica" };
      }
    } else if (dopo.minuti < prima.minuti) {
      // Meno ore: non si chiede niente, si avvisa. Vale **anche** se la
      // persona resta comunque oltre il contratto: quello che conta è che
      // questo salvataggio le toglie del lavoro, non dove si trova rispetto
      // alla soglia.
      if (imp.conferma_modifiche) {
        return { tipo: "avviso", motivo: "ore_tolte" };
      }
    } else if (dopo.date !== prima.date || dopo.start_time !== prima.start_time) {
      // Stesse ore, altro giorno o altro orario. Non toglie e non aggiunge
      // niente, ma un turno che si sposta cambia la giornata a una persona.
      if (imp.conferma_modifiche) {
        return { tipo: "avviso", motivo: "turno_spostato" };
      }
    }
    // Se l'interruttore delle modifiche è spento non si è deciso niente, e
    // si continua: l'orario fuori contratto qui sotto ha un interruttore
    // suo, e spegnere l'uno non deve spegnere l'altro.
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

import type { Shift } from "@/lib/types";

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

/** La frase intera, per il titolo che compare passandoci sopra. */
export const SPIEGA_CONFERMA: Record<StatoConferma, string> = {
  in_attesa:
    "Il turno vale, ma la persona non si è ancora espressa: può ancora rifiutarlo",
  accettato: "La persona ha guardato e ha detto di sì",
  rifiutato: "Rifiutato dalla persona: apri i messaggi in cima alla pagina",
};

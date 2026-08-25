/** La matematica del trascinamento delle barre nella Supervisione.
 *
 *  Una barra si puo' prendere per i bordi — e allora cambia l'orario di
 *  inizio o di fine — oppure per il centro, e allora si sposta intera,
 *  con le stesse ore. Qui si decide solo dove finisce la barra: niente
 *  puntatore, niente pixel, cosi' si prova senza browser. Il componente
 *  converte i pixel in minuti e a noi arriva solo il delta. */

import { MINUTI_GIORNO, oraDa } from "@/lib/supervisione/copertura";

/** Il passo a cui si aggancia il trascinamento: un quarto d'ora, la stessa
 *  granularita' delle fette di copertura. Il delta e' agganciato, non gli
 *  orari: un turno delle 09:10 trascinato resta sui suoi dieci minuti. */
export const PASSO = 15;

export type TipoTrascina = "inizio" | "fine" | "sposta";

const blocca = (v: number, minimo: number, massimo: number) =>
  Math.min(massimo, Math.max(minimo, v));

/** Dove finisce la barra dopo un trascinamento. `inizio` e `durata` sono i
 *  minuti veri del turno (l'inizio dalla mezzanotte del suo giorno, la fine
 *  puo' scavalcare), `delta` i minuti di cui si e' mosso il puntatore.
 *
 *  I limiti: l'inizio resta dentro il suo giorno — spostarlo prima della
 *  mezzanotte cambierebbe la data, e quella si cambia dal pannello — la
 *  durata non scende sotto un passo e non arriva mai a un giorno intero,
 *  perche' inizio e fine uguali il salvataggio li rifiuta. */
export function applicaTrascina(
  tipo: TipoTrascina,
  inizio: number,
  durata: number,
  delta: number,
): { inizio: number; durata: number } {
  const scatto = Math.round(delta / PASSO) * PASSO;
  // Un trascinamento che non arriva a mezzo passo lascia il turno com'e',
  // qualunque sia: senza questa riga un turno lunghissimo si accorcerebbe
  // fino al massimo consentito anche solo sfiorandolo.
  if (scatto === 0) return { inizio, durata };

  const fine = inizio + durata;
  // Un turno gia' piu' corto di un passo non si allunga da solo: il minimo
  // e' la sua durata, non il passo.
  const minima = Math.min(PASSO, durata);
  // L'ultimo inizio possibile dentro la giornata, sul quarto d'ora: le
  // 23:45. Fermarsi a 23:59 darebbe orari che nessuno scriverebbe a mano.
  const ultimoInizio = MINUTI_GIORNO - PASSO;

  if (tipo === "inizio") {
    const nuovo = blocca(
      inizio + scatto,
      Math.max(0, fine - (MINUTI_GIORNO - PASSO)),
      Math.min(fine - minima, ultimoInizio),
    );
    return { inizio: nuovo, durata: fine - nuovo };
  }

  if (tipo === "fine") {
    const nuova = blocca(
      fine + scatto,
      inizio + minima,
      inizio + MINUTI_GIORNO - PASSO,
    );
    return { inizio, durata: nuova - inizio };
  }

  return { inizio: blocca(inizio + scatto, 0, ultimoInizio), durata };
}

/** Gli orari HH:MM per il salvataggio. La fine si riporta nel giorno: un
 *  turno che scavalca la mezzanotte si riconosce da fine <= inizio, come
 *  dappertutto nell'app. */
export function orariDa(
  inizio: number,
  durata: number,
): { start_time: string; end_time: string } {
  return {
    start_time: oraDa(inizio % MINUTI_GIORNO),
    end_time: oraDa((inizio + durata) % MINUTI_GIORNO),
  };
}

/** Le ore che verranno lavorate davvero.
 *
 *  Un turno scritto a tabellone non è per forza un turno che qualcuno farà.
 *  Due ragioni, e valgono entrambe:
 *
 *  - **quel giorno la persona è assente.** Il turno resta al suo posto
 *    apposta — è il buco che il responsabile deve coprire — ma non lo fa
 *    nessuno;
 *  - **la persona ha detto di no.** La riga resta a tabellone finché il
 *    responsabile non apre la casella, e possono passare giorni.
 *
 *  Perché sta in un file suo: la stessa domanda la fanno otto punti — il
 *  totale delle ore del tabellone (`components/turni/roster.tsx`), il totale
 *  della settimana del dipendente (`components/turni/my-week.tsx`), il
 *  controllo prima di pubblicare (`lib/pubblicazione.ts`), il Prospetto
 *  (`lib/prospetto.ts`), la domanda «questo salvataggio è uno
 *  straordinario?» e quella che parte alla pubblicazione, entrambe in
 *  `turni/actions.ts`, lo scostamento di Oggi (`lib/oggi.ts`) e i turni che
 *  Oggi disegna in fascia (`app/(app)/oggi/page.tsx`).
 *
 *  ⚠️ Questo elenco è il registro nato apposta per non perdere un punto di
 *  chiamata: chi ne aggiunge uno lo scrive qui. È nato con sei voci su otto
 *  — mancavano i due di Oggi — ed è stato allineato il 30 agosto 2026.
 *
 *  Fino al 29 agosto 2026 i primi due
 *  toglievano i turni rifiutati, gli altri no: la stessa persona, la stessa
 *  settimana, due numeri su due schermate. Nel caso peggiore il tabellone
 *  mostrava la persona sotto le sue ore da contratto e il salvataggio
 *  successivo la dichiarava in straordinario.
 *
 *  `rifiutato_at` basta da sola, senza guardare `richiede_conferma`: il
 *  database non accetta un no su un turno che non chiedeva una risposta
 *  (`rifiuta_turno`).
 *
 *  Funzione pura: si prova con
 *  `node --import ./scripts/alias.mjs scripts/prova-ore-effettive.mjs`. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";
import { durationMinutes } from "@/lib/date";

export type TurnoEffettivo = {
  /** null = turno di nessuno. Non è assente nessuno, quindi le sue ore
   *  contano: sono ore da coprire, non ore sparite. */
  profile_id: string | null;
  date: string;
  /** Valorizzata = la persona ha detto di no. */
  rifiutato_at?: string | null;
};

/** Vero se le ore di questo turno finiranno in un monte ore. */
export function siLavoreraDavvero(
  turno: TurnoEffettivo,
  assenze: AssenzaInput[],
): boolean {
  if (turno.rifiutato_at) return false;
  return !assenzaDelGiorno(assenze, turno.profile_id, turno.date);
}

/** Le ore che ciascuno lavorerà davvero in questi turni, in minuti.
 *
 *  È la stessa somma che fanno il tabellone e il Prospetto, impacchettata
 *  per chi deve farla su tutta l'azienda in un colpo solo — oggi la domanda
 *  «questa settimana è in straordinario?» che parte alla pubblicazione
 *  (`turni/actions.ts`). Fino al 30 agosto 2026 quel punto sommava i turni
 *  grezzi: con un giorno di assenza o un no ancora aperto, la stessa
 *  pubblicazione poteva dire «sta sotto le sue ore da contratto» e subito
 *  dopo chiedere alla stessa persona di confermare uno straordinario.
 *
 *  I turni di nessuno restano fuori: non hanno una persona a cui sommarli. */
export function minutiPerPersona(
  turni: (TurnoEffettivo & { start_time: string; end_time: string })[],
  assenze: AssenzaInput[],
): Map<string, number> {
  const minuti = new Map<string, number>();
  for (const t of turni) {
    if (!t.profile_id) continue;
    if (!siLavoreraDavvero(t, assenze)) continue;
    minuti.set(
      t.profile_id,
      (minuti.get(t.profile_id) ?? 0) + durationMinutes(t.start_time, t.end_time),
    );
  }
  return minuti;
}

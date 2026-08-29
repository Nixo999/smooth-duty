/** Chi, in questa settimana, sta sotto le sue ore da contratto.
 *
 *  È la domanda che l'app fa a se stessa **prima di pubblicare**. In bozza
 *  una settimana incompleta è normale — è tutto il senso della bozza: si
 *  comincia da un foglio vuoto e ci si arriva. Ma pubblicare vuol dire dire
 *  alla squadra «questa è la settimana», e una settimana che a qualcuno dà
 *  meno ore di quelle che ha per contratto non è pronta: è un errore che si
 *  scopre a fine mese, sulla busta paga, quando rimediare costa molto di più
 *  che accorgersene adesso.
 *
 *  Funzione pura, come gli altri motori: si prova con
 *  `node --import ./scripts/alias.mjs scripts/prova-pubblicazione.mjs`.
 *
 *  Non riguarda tutti, e i due esclusi sono esclusi per lo stesso motivo —
 *  non hanno un monte ore da rispettare:
 *  - **chi è a chiamata**, che per definizione lavora quando serve;
 *  - **chi non ha ore da contratto scritte** in scheda.
 *
 *  E chi è assente conta **solo per i giorni in cui c'è**: pretendere quaranta
 *  ore da chi è in malattia da lunedì bloccherebbe la pubblicazione per
 *  sempre, e quelle ore non le deve nessuno. La proporzione sui giorni è la
 *  stessa del Prospetto (`ore × giorni / 7`), e per la stessa ragione: di un
 *  giorno di assenza non si sa quante ore avrebbe avuto.
 *
 *  ⚠️ Un turno **rifiutato** non conta fra le ore fatte, come non conta nel
 *  totale che il dipendente legge sul telefono, nel monte ore a tabellone e
 *  nel Prospetto: quali ore si faranno davvero lo dice `lib/ore-effettive.ts`,
 *  e lo dice per tutti e quattro. La conseguenza si vede: una settimana con
 *  un no ancora aperto torna a chiedere conferma prima di pubblicare le
 *  modifiche. È voluto — è esattamente il caso in cui il buco c'è — e si
 *  passa oltre con lo stesso «pubblica lo stesso» di sempre. */

import { type AssenzaInput, assenzaDelGiorno } from "@/lib/assenze";
import { durationMinutes } from "@/lib/date";
import { siLavoreraDavvero } from "@/lib/ore-effettive";

export type PersonaContratto = {
  id: string;
  full_name: string;
  /** Ore settimanali da contratto. null = niente da rispettare. */
  contract_hours: number | null;
  on_call: boolean;
};

export type TurnoMinuti = {
  profile_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  /** Valorizzata = la persona ha detto di no. Vale da sola: il database
   *  rifiuta un no su un turno che non chiedeva una risposta
   *  (`rifiuta_turno`, `richiede_conferma is not null`). */
  rifiutato_at: string | null;
};

export type SottoContratto = {
  id: string;
  nome: string;
  /** Minuti che mancano per arrivare alle ore dovute. Sempre > 0. */
  mancano: number;
  /** Le ore dovute questa settimana, in minuti: già ridotte in proporzione
   *  ai giorni in cui la persona c'è. */
  dovuti: number;
};

export function chiStaSottoContratto(input: {
  /** Solo le persone attive: il filtro non è qui. */
  persone: PersonaContratto[];
  turni: TurnoMinuti[];
  assenze: AssenzaInput[];
  /** I sette giorni della settimana, `YYYY-MM-DD`. */
  giorni: string[];
}): SottoContratto[] {
  const { persone, turni, assenze, giorni } = input;
  const fuori: SottoContratto[] = [];

  for (const p of persone) {
    if (p.on_call || p.contract_hours === null) continue;

    const presenti = giorni.filter((g) => !assenzaDelGiorno(assenze, p.id, g));
    if (presenti.length === 0) continue;

    // Arrotondato per difetto: su una settimana spezzata il conto esatto
    // cade sui minuti, e bloccare una pubblicazione per un minuto di
    // arrotondamento sarebbe una regola che nessuno capirebbe.
    const dovuti = Math.floor((Number(p.contract_hours) * 60 * presenti.length) / 7);

    const fatti = turni
      .filter(
        (t) =>
          t.profile_id === p.id &&
          giorni.includes(t.date) &&
          // Assente quel giorno, o ha detto di no: in tutti e due i casi
          // quelle ore non le fa nessuno, e contarle spegnerebbe l'avviso
          // proprio nel caso in cui il buco esiste davvero — cioè quello
          // che questa domanda serve a trovare.
          siLavoreraDavvero(t, assenze),
      )
      .reduce((n, t) => n + durationMinutes(t.start_time, t.end_time), 0);

    if (fatti < dovuti) {
      fuori.push({ id: p.id, nome: p.full_name, mancano: dovuti - fatti, dovuti });
    }
  }

  // In ordine di gravità: chi ne ha di meno viene prima, perché è il primo a
  // cui il responsabile deve mettere mano.
  return fuori.sort((a, b) => b.mancano - a.mancano || a.nome.localeCompare(b.nome));
}

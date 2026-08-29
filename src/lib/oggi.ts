/** Il conto della settimana come lo legge la schermata «Oggi».
 *
 *  Una funzione sola, e il motivo è tutto qui: sulla stessa schermata
 *  convivevano due definizioni di «ore dovute». Il Prospetto chiama `attesi`
 *  le ore da contratto **intere** (`ore × giorni / 7`, senza guardare le
 *  assenze), mentre il controllo prima di pubblicare
 *  (`lib/pubblicazione.ts`) le riduce in proporzione ai giorni in cui la
 *  persona c'è davvero. Messi affiancati dicono due numeri diversi per la
 *  stessa parola, e chi guarda non ha modo di sapere quale dei due gli serve.
 *
 *  Qui vale **quella ridotta**, la stessa di `chiStaSottoContratto`: da chi è
 *  in malattia da lunedì non si pretendono quaranta ore, perché quelle ore non
 *  le deve nessuno. Lo stesso numero regge il confronto grande, chi sta sotto
 *  e chi sta sopra: tre risposte dalla stessa domanda.
 *
 *  ⚠️ Divergenza dichiarata, ed è voluta: quando l'app decide se un
 *  salvataggio è uno straordinario (`turni/actions.ts`) confronta col
 *  contratto **pieno**, non con quello ridotto. Chi è stato assente metà
 *  settimana può quindi comparire fra i «sopra» di questa schermata senza che
 *  il tabellone gli abbia chiesto niente. È il verso giusto per una schermata
 *  che serve a guardare la settimana: le ore che quella persona sta facendo
 *  sono davvero più di quelle che le toccavano.
 *
 *  Funzione pura, come gli altri motori: si prova con
 *  `node --import ./scripts/alias.mjs scripts/prova-oggi.mjs`. */

import { assenzaDelGiorno, type AssenzaInput } from "@/lib/assenze";
import { durationMinutes } from "@/lib/date";
import { siLavoreraDavvero } from "@/lib/ore-effettive";

export type PersonaOre = {
  id: string;
  full_name: string;
  /** Ore settimanali da contratto. null = niente da rispettare. */
  contract_hours: number | null;
  on_call: boolean;
};

export type TurnoOre = {
  profile_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  /** Valorizzata = la persona ha detto di no, e quelle ore non le farà. */
  rifiutato_at?: string | null;
};

export type Scostamento = {
  id: string;
  nome: string;
  /** Le ore dovute questa settimana, in minuti, già ridotte ai giorni in cui
   *  la persona c'è. */
  dovuti: number;
  /** Le ore che farà davvero, in minuti. */
  fatti: number;
  /** `fatti - dovuti`: negativo sotto contratto, positivo oltre. */
  scarto: number;
};

export type BilancioSettimana = {
  /** Solo chi ha un monte ore da rispettare ed è presente almeno un giorno. */
  righe: Scostamento[];
  /** Chi non ci arriva, dal più lontano. */
  sotto: Scostamento[];
  /** Chi lo supera, dal più alto. È la metà che mancava: al telefono si
   *  promette che il sistema dice chi è libero **e** chi è già sopra le sue
   *  ore. */
  sopra: Scostamento[];
  /** Minuti che verranno lavorati davvero da chi ha un contratto. */
  effettivi: number;
  /** Minuti dovuti da chi ha un contratto. */
  dovuti: number;
  /** Minuti di chi un contratto non ce l'ha: a chiamata, o senza ore in
   *  scheda. Restano fuori dal confronto — sommarli al numeratore di un
   *  rapporto il cui denominatore non li contempla è il modo più rapido di
   *  scrivere una percentuale che non vuol dire niente — ma si dicono,
   *  perché sono ore che qualcuno lavora. */
  fuoriContratto: number;
  /** Minuti di turno che non sono di nessuno. */
  scoperti: number;
};

export function bilancioSettimana(input: {
  /** Solo le persone attive: il filtro non è qui. */
  persone: PersonaOre[];
  turni: TurnoOre[];
  assenze: AssenzaInput[];
  /** I sette giorni della settimana, `YYYY-MM-DD`. */
  giorni: string[];
}): BilancioSettimana {
  const { persone, turni, assenze, giorni } = input;

  const dentro = new Set(giorni);
  const fattiPer = new Map<string, number>();
  let scoperti = 0;

  for (const t of turni) {
    if (!dentro.has(t.date)) continue;
    const durata = durationMinutes(t.start_time, t.end_time);

    // Un turno di nessuno non è un'ora sparita: è un'ora da coprire, e non
    // appartiene al conto di nessuna persona.
    if (!t.profile_id) {
      scoperti += durata;
      continue;
    }
    if (!siLavoreraDavvero(t, assenze)) continue;

    fattiPer.set(t.profile_id, (fattiPer.get(t.profile_id) ?? 0) + durata);
  }

  const righe: Scostamento[] = [];
  let effettivi = 0;
  let dovuti = 0;
  let fuoriContratto = 0;

  for (const p of persone) {
    const fatti = fattiPer.get(p.id) ?? 0;

    if (p.on_call || p.contract_hours === null) {
      fuoriContratto += fatti;
      continue;
    }

    // Assente tutta la settimana: non deve niente, e non ha fatto niente.
    // Pretendere le sue ore terrebbe acceso per sempre un avviso su cui non
    // c'è nulla da fare.
    const presenti = giorni.filter((g) => !assenzaDelGiorno(assenze, p.id, g)).length;
    if (presenti === 0) continue;

    // Per difetto, come in `lib/pubblicazione.ts`: su una settimana spezzata
    // il conto esatto cade sui minuti, e segnalare qualcuno per un minuto di
    // arrotondamento sarebbe una regola che nessuno capirebbe.
    const dovutiSuoi = Math.floor((Number(p.contract_hours) * 60 * presenti) / 7);

    righe.push({
      id: p.id,
      nome: p.full_name,
      dovuti: dovutiSuoi,
      fatti,
      scarto: fatti - dovutiSuoi,
    });
    effettivi += fatti;
    dovuti += dovutiSuoi;
  }

  // In ordine di gravità: lo scostamento più grosso per primo, perché è
  // quello a cui il responsabile deve mettere mano.
  const perGravita = (a: Scostamento, b: Scostamento) =>
    Math.abs(b.scarto) - Math.abs(a.scarto) || a.nome.localeCompare(b.nome);

  return {
    righe,
    sotto: righe.filter((r) => r.scarto < 0).sort(perGravita),
    sopra: righe.filter((r) => r.scarto > 0).sort(perGravita),
    effettivi,
    dovuti,
    fuoriContratto,
    scoperti,
  };
}
